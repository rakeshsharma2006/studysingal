const { todayLocal, isValidDate } = require('../../utils/date')
const { getKnowledgeThresholds } = require('../analytics/config')

const FACTOR_WEIGHTS = Object.freeze({
  exam_urgency: 30,
  knowledge_weakness: 30,
  syllabus_incompletion: 25,
  revision_delay: 15,
})

const TOPIC_STATUS_SCORES = Object.freeze({
  NOT_STARTED: 100,
  IN_PROGRESS: 50,
  COMPLETED: 0,
})

const PRIORITY_ORDER = Object.freeze({ HIGH: 0, MEDIUM: 1, LOW: 2 })

function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T00:00:00.000Z`)
  return Math.round((end - start) / 86400000)
}

function scoreExamUrgency(examDate, today) {
  if (!examDate || !isValidDate(examDate)) return null
  const remaining = daysBetween(today, examDate)
  if (remaining < 0) return null
  if (remaining <= 3) return 100
  if (remaining <= 7) return 80
  if (remaining <= 14) return 60
  if (remaining <= 30) return 40
  return 20
}

function scoreRevisionDelay(tasks, today) {
  const pending = tasks
    .filter((task) => task.status === 'PENDING')
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id)
  const nextTask = pending[0]
  if (!nextTask) return { score: 0, task: null }
  const delay = daysBetween(today, nextTask.due_date)
  if (delay < 0) return { score: 100, task: nextTask }
  if (delay === 0) return { score: 70, task: nextTask }
  if (delay <= 3) return { score: 40, task: nextTask }
  return { score: 0, task: nextTask }
}

function calculatePriorityScore(factors, weights = FACTOR_WEIGHTS) {
  const available = Object.entries(factors).filter(([, score]) => score !== null && score !== undefined)
  if (!available.length) return { priority_score: null, available_weight: 0 }
  const availableWeight = available.reduce((total, [key]) => total + weights[key], 0)
  const weightedScore = available.reduce((total, [key, score]) => total + score * weights[key], 0)
  return {
    priority_score: Math.round((weightedScore / availableWeight) * 10) / 10,
    available_weight: availableWeight,
  }
}

function recommendedAction(topic, evidenceScore, revisionScore, thresholds) {
  if (revisionScore > 0) return 'REVISE_TOPIC'
  if (evidenceScore == null && topic.status !== 'COMPLETED') return 'TAKE_KNOWLEDGE_ASSESSMENT'
  if (evidenceScore != null && evidenceScore < thresholds.reinforcementBelow) return 'PRACTICE_QUESTIONS'
  if (topic.status === 'NOT_STARTED') return 'STUDY_TOPIC'
  if (topic.status === 'IN_PROGRESS') return 'COMPLETE_TOPIC'
  return null
}

function recommendationReason(topic, factors, action, revisionTask) {
  const reasons = []
  if (factors.exam_urgency != null) {
    const days = daysBetween(topic.as_of_date, topic.exam_date)
    reasons.push(`The exam is ${days} day${days === 1 ? '' : 's'} away (urgency ${factors.exam_urgency}/100).`)
  }
  if (factors.knowledge_weakness != null) {
    reasons.push(`The latest evidence score is ${100 - factors.knowledge_weakness}%; its knowledge-weakness priority contribution is ${factors.knowledge_weakness}/100.`)
  } else if (action === 'TAKE_KNOWLEDGE_ASSESSMENT') {
    reasons.push('There is no scored assessment yet, so understanding is unverified rather than assumed weak.')
  }
  if (factors.syllabus_incompletion === 100) reasons.push('This topic has not been started.')
  if (factors.syllabus_incompletion === 50) reasons.push('This topic is in progress and still needs completion.')
  if (revisionTask && factors.revision_delay > 0) {
    reasons.push(`A revision is ${revisionTask.due_date < topic.as_of_date ? 'overdue' : revisionTask.due_date === topic.as_of_date ? 'due today' : 'due within three days'}.`)
  }
  if (!reasons.length) reasons.push('This topic is a remaining part of the syllabus and has the highest available recovery priority.')
  return reasons.join(' ')
}

function buildRecommendations({
  topics = [],
  revisions = [],
  today = todayLocal(),
  thresholds = getKnowledgeThresholds(),
  limit = 50,
}) {
  const revisionMap = new Map()
  for (const revision of revisions) {
    const records = revisionMap.get(revision.topic_id) || []
    records.push(revision)
    revisionMap.set(revision.topic_id, records)
  }

  const recommendations = []
  for (const topic of topics) {
    const revision = scoreRevisionDelay(revisionMap.get(topic.id) || [], today)
    const evidenceScore = topic.latest_assessment?.evidence_score ?? null
    const factors = {
      exam_urgency: scoreExamUrgency(topic.exam_date, today),
      knowledge_weakness: evidenceScore == null ? null : Math.max(0, Math.min(100, 100 - evidenceScore)),
      syllabus_incompletion: TOPIC_STATUS_SCORES[topic.status] ?? null,
      revision_delay: revision.score,
    }

    const genuinelyNeedsWork = topic.status !== 'COMPLETED'
      || (evidenceScore != null && evidenceScore < thresholds.reinforcementBelow)
      || revision.score > 0
    if (!genuinelyNeedsWork) continue

    let action = recommendedAction(topic, evidenceScore, revision.score, thresholds)
    if (topic.status === 'COMPLETED' && evidenceScore == null && revision.score === 0) action = null
    if (topic.status === 'COMPLETED' && evidenceScore != null && evidenceScore >= thresholds.reinforcementBelow && revision.score === 0) action = null
    if (!action) continue

    const score = calculatePriorityScore(factors)
    if (score.priority_score === null) continue
    const recommendationTopic = { ...topic, as_of_date: today }
    recommendations.push({
      topic_id: topic.id,
      topic_name: topic.title,
      subject_id: topic.subject_id,
      subject_name: topic.subject_name,
      exam_date: topic.exam_date || null,
      priority_score: score.priority_score,
      priority_level: score.priority_score >= 75 ? 'HIGH' : score.priority_score >= 50 ? 'MEDIUM' : 'LOW',
      factors: Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, {
        score: value,
        weight: value == null ? null : FACTOR_WEIGHTS[key],
      }])),
      available_weight: score.available_weight,
      action,
      reason: recommendationReason(recommendationTopic, factors, action, revision.task),
      estimated_minutes: topic.estimated_minutes,
      topic_priority: topic.priority || 'MEDIUM',
    })
  }

  recommendations.sort((left, right) => (
    right.priority_score - left.priority_score
    || (left.exam_date ? 0 : 1) - (right.exam_date ? 0 : 1)
    || (left.exam_date || '9999-12-31').localeCompare(right.exam_date || '9999-12-31')
    || PRIORITY_ORDER[left.topic_priority] - PRIORITY_ORDER[right.topic_priority]
    || left.subject_name.localeCompare(right.subject_name)
    || left.topic_name.localeCompare(right.topic_name)
    || left.topic_id - right.topic_id
  ))

  return {
    as_of_date: today,
    weights: FACTOR_WEIGHTS,
    thresholds,
    total_recommendations: recommendations.length,
    recommendations: recommendations.slice(0, limit).map((recommendation) => {
      const result = { ...recommendation }
      delete result.topic_priority
      return result
    }),
    disclaimer: 'Recommendations organize recorded study information. They do not automatically change topic status or guarantee academic outcomes.',
  }
}

async function getRecommendations(db, options = {}) {
  const today = options.today || todayLocal()
  const [topics, assessments, revisions] = await Promise.all([db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.estimated_minutes,
      u.subject_id, s.name AS subject_name, s.exam_date
    FROM topics t
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    ORDER BY t.id
  `).all(), db.prepare('SELECT * FROM topic_assessments ORDER BY created_at DESC, id DESC').all(),
  db.prepare('SELECT * FROM revision_tasks ORDER BY due_date, id').all()])
  const { buildKnowledgeAnalysis } = require('../analytics/knowledgeGap')
  const knowledge = buildKnowledgeAnalysis({ topics, assessments, revisions, today, thresholds: options.thresholds })
  const analyzed = new Map(knowledge.topics.map((topic) => [topic.id, topic]))
  const records = topics.map((topic) => ({
    ...topic,
    latest_assessment: analyzed.get(topic.id)?.latest_assessment || null,
  }))
  const thresholds = options.thresholds || getKnowledgeThresholds()
  return buildRecommendations({
    topics: records,
    revisions,
    today,
    thresholds,
    limit: options.limit || 50,
  })
}

module.exports = {
  FACTOR_WEIGHTS,
  TOPIC_STATUS_SCORES,
  scoreExamUrgency,
  scoreRevisionDelay,
  calculatePriorityScore,
  buildRecommendations,
  getRecommendations,
}
