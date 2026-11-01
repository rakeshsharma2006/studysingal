const { todayLocal } = require('../../utils/date')
const { getKnowledgeThresholds } = require('./config')
const { compareAssessments, normalizeAssessment } = require('./knowledgeConfidence')

function buildKnowledgeAnalysis({ topics = [], assessments = [], revisions = [], today = todayLocal(), thresholds = getKnowledgeThresholds() }) {
  const byTopic = new Map()
  for (const assessment of assessments) {
    const attempts = byTopic.get(assessment.topic_id) || []
    attempts.push(assessment)
    byTopic.set(assessment.topic_id, attempts)
  }
  const revisionByTopic = new Map()
  for (const revision of revisions) {
    const tasks = revisionByTopic.get(revision.topic_id) || []
    tasks.push(revision)
    revisionByTopic.set(revision.topic_id, tasks)
  }

  const analyzed = topics.map((topic) => {
    const attempts = (byTopic.get(topic.id) || []).sort((a, b) => (
      b.created_at.localeCompare(a.created_at) || b.id - a.id
    ))
    const comparison = compareAssessments(attempts[0], attempts[1], thresholds)
    const latest = comparison.latest
    const pendingRevisions = (revisionByTopic.get(topic.id) || [])
      .filter((task) => task.status === 'PENDING')
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
    return {
      ...topic,
      assessment_count: attempts.length,
      latest_assessment: latest,
      previous_assessment: comparison.previous,
      score_change: comparison.change,
      trend: comparison.trend,
      classification: latest?.classification || 'UNVERIFIED',
      needs_reinforcement: latest?.evidence_score != null && latest.evidence_score < thresholds.reinforcementBelow,
      is_completed_with_weak_evidence: topic.status === 'COMPLETED'
        && latest?.evidence_score != null
        && latest.evidence_score < thresholds.reinforcementBelow,
      declining: comparison.trend === 'DECLINING',
      pending_revisions: pendingRevisions,
      overdue_revisions: pendingRevisions.filter((task) => task.due_date < today),
      awaiting_revision: pendingRevisions.some((task) => task.due_date <= today),
    }
  })

  const recentAssessments = assessments
    .map((assessment) => normalizeAssessment(assessment, thresholds))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
    .slice(0, 20)
    .map((assessment) => ({
      ...assessment,
      topic_title: topics.find((topic) => topic.id === assessment.topic_id)?.title || 'Unknown topic',
    }))

  return {
    thresholds,
    topics: analyzed,
    strong_topics: analyzed.filter((topic) => topic.classification === 'RELATIVELY_STRONG'),
    weak_topics: analyzed.filter((topic) => topic.classification === 'NEEDS_ATTENTION' || topic.classification === 'REQUIRES_REINFORCEMENT'),
    completed_topics_with_weak_evidence: analyzed.filter((topic) => topic.is_completed_with_weak_evidence),
    unverified_topics: analyzed.filter((topic) => topic.classification === 'UNVERIFIED'),
    declining_topics: analyzed.filter((topic) => topic.declining),
    topics_awaiting_revision: analyzed.filter((topic) => topic.awaiting_revision),
    overdue_revision_tasks: analyzed.flatMap((topic) => topic.overdue_revisions.map((task) => ({
      ...task,
      topic_title: topic.title,
      subject_name: topic.subject_name,
    }))),
    recent_assessments: recentAssessments,
    disclaimer: 'Evidence scores summarize recorded quiz, recall, and confidence inputs. They are not scientifically validated measures of intelligence or mastery.',
  }
}

function getKnowledgeAnalysis(db, options = {}) {
  const thresholds = getKnowledgeThresholds(options.thresholds)
  const topics = db.prepare(`
    SELECT t.*, u.subject_id, s.name AS subject_name, u.title AS unit_title
    FROM topics t JOIN units u ON u.id = t.unit_id JOIN subjects s ON s.id = u.subject_id
    ORDER BY s.name COLLATE NOCASE, u.position, t.id
  `).all()
  const assessments = db.prepare('SELECT * FROM topic_assessments ORDER BY created_at DESC, id DESC').all()
  const revisions = db.prepare('SELECT * FROM revision_tasks ORDER BY due_date, id').all()
  return buildKnowledgeAnalysis({ topics, assessments, revisions, today: options.today || todayLocal(), thresholds })
}

module.exports = { buildKnowledgeAnalysis, getKnowledgeAnalysis }
