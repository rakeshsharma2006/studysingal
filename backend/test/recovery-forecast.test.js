const assert = require('node:assert/strict')
const test = require('node:test')
const {
  scoreExamUrgency,
  calculatePriorityScore,
  buildRecommendations,
} = require('../services/recovery/recommendationEngine')
const {
  getForecastWindow,
  estimateCompletion,
  buildScenario,
  buildSubjectForecast,
} = require('../services/forecast/examForecast')
const { createApp } = require('../app')
const { createDatabase } = require('../database')

test('recovery scoring handles urgency boundaries and renormalizes unavailable factors', () => {
  const today = '2026-01-01'
  assert.equal(scoreExamUrgency('2026-01-04', today), 100)
  assert.equal(scoreExamUrgency('2026-01-05', today), 80)
  assert.equal(scoreExamUrgency('2026-01-08', today), 80)
  assert.equal(scoreExamUrgency('2026-01-09', today), 60)
  assert.equal(scoreExamUrgency('2026-01-15', today), 60)
  assert.equal(scoreExamUrgency('2026-01-16', today), 40)
  assert.equal(scoreExamUrgency('2026-01-31', today), 40)
  assert.equal(scoreExamUrgency('2026-02-01', today), 20)
  assert.equal(scoreExamUrgency(null, today), null)
  assert.equal(scoreExamUrgency('2025-12-31', today), null)

  assert.deepEqual(calculatePriorityScore({
    exam_urgency: null,
    knowledge_weakness: 100,
    syllabus_incompletion: 0,
    revision_delay: 0,
  }), { priority_score: 42.9, available_weight: 70 })
  assert.deepEqual(calculatePriorityScore({
    exam_urgency: null,
    knowledge_weakness: null,
    syllabus_incompletion: null,
    revision_delay: null,
  }), { priority_score: null, available_weight: 0 })
})

test('recommendations distinguish unverified, weak, completed, and revision-due topics', () => {
  const recommendations = buildRecommendations({
    today: '2026-11-15',
    topics: [
      { id: 1, title: 'Assess me', subject_id: 1, subject_name: 'Biology', status: 'NOT_STARTED', exam_date: '2026-11-20', estimated_minutes: 25 },
      { id: 2, title: 'Already strong', subject_id: 1, subject_name: 'Biology', status: 'COMPLETED', exam_date: '2026-11-20', estimated_minutes: 20 },
      { id: 3, title: 'Weak completed topic', subject_id: 1, subject_name: 'Biology', status: 'COMPLETED', exam_date: null, estimated_minutes: 30, latest_assessment: { evidence_score: 40 } },
      { id: 4, title: 'Revision due', subject_id: 1, subject_name: 'Biology', status: 'COMPLETED', exam_date: null, estimated_minutes: 30 },
    ],
    revisions: [{ id: 1, topic_id: 4, due_date: '2026-11-14', status: 'PENDING' }],
  })

  assert.equal(recommendations.total_recommendations, 3)
  assert.deepEqual(recommendations.recommendations.map((item) => item.topic_id), [1, 4, 3])
  assert.equal(recommendations.recommendations[0].action, 'TAKE_KNOWLEDGE_ASSESSMENT')
  assert.match(recommendations.recommendations[0].reason, /unverified rather than assumed weak/)
  assert.equal(recommendations.recommendations[1].action, 'REVISE_TOPIC')
  assert.equal(recommendations.recommendations[2].action, 'PRACTICE_QUESTIONS')
  assert.equal(recommendations.recommendations[0].estimated_minutes, 25)
  assert.match(recommendations.recommendations[2].reason, /40%/)
  assert.doesNotMatch(recommendations.recommendations[2].reason, /needs reinforcement/)
})

test('recommendation ties sort deterministically by topic priority then title', () => {
  const recommendations = buildRecommendations({
    today: '2026-11-15',
    topics: [
      { id: 1, title: 'Alpha', subject_id: 1, subject_name: 'Biology', status: 'NOT_STARTED', priority: 'LOW' },
      { id: 2, title: 'Zulu', subject_id: 1, subject_name: 'Biology', status: 'NOT_STARTED', priority: 'HIGH' },
      { id: 3, title: 'Beta', subject_id: 1, subject_name: 'Biology', status: 'NOT_STARTED', priority: 'MEDIUM' },
    ],
  })
  assert.deepEqual(recommendations.recommendations.map((item) => item.topic_id), [2, 3, 1])
})

test('recommendations use the supplied reinforcement threshold', () => {
  const topics = [{
    id: 1,
    title: 'In progress',
    subject_id: 1,
    subject_name: 'Biology',
    status: 'IN_PROGRESS',
    latest_assessment: { evidence_score: 65 },
  }]
  const recommendations = buildRecommendations({
    today: '2026-11-15',
    topics,
    thresholds: { needsAttentionBelow: 40, reinforcementBelow: 60 },
  })
  assert.equal(recommendations.recommendations[0].action, 'COMPLETE_TOPIC')
})

test('forecast window and baseline use a 14-day calendar window and round days upward', () => {
  assert.deepEqual(getForecastWindow('2026-11-15'), { from: '2026-11-02', to: '2026-11-15' })
  assert.deepEqual(estimateCompletion({
    remainingTopics: 12,
    completedTopicsInWindow: 8,
    today: '2026-11-15',
    examDate: '2026-12-10',
  }), {
    remaining_topics: 12,
    completed_topics_in_window: 8,
    window_days: 14,
    current_topics_per_day: 0.57,
    estimated_completion_days: 21,
    projected_completion_date: '2026-12-06',
    days_until_exam: 25,
    estimated_buffer_days: 4,
    status: 'ON_PROJECTED_SCHEDULE',
    status_reason: 'The current 14-day completion pace projects completion on or before the exam date.',
  })
})

test('forecast does not invent a rate and scenarios recalculate independently', () => {
  const insufficient = estimateCompletion({
    remainingTopics: 4,
    completedTopicsInWindow: 0,
    today: '2026-11-15',
    examDate: '2026-11-20',
  })
  assert.equal(insufficient.estimated_completion_days, null)
  assert.equal(insufficient.status, 'INSUFFICIENT_DATA')
  assert.equal(insufficient.status_reason, 'Not enough study history to calculate a forecast.')

  assert.deepEqual(buildScenario({
    remainingTopics: 12,
    targetTopicsPerDay: 2,
    today: '2026-11-15',
    examDate: '2026-11-25',
  }), {
    target_topics_per_day: 2,
    estimated_completion_days: 6,
    projected_completion_date: '2026-11-21',
    days_until_exam: 10,
    estimated_buffer_days: 4,
    status: 'ON_PROJECTED_SCHEDULE',
  })
  assert.throws(() => buildScenario({ remainingTopics: 2, targetTopicsPerDay: 0 }), RangeError)
})

test('all-completed syllabus projects zero days while missing exam dates remain explicit', () => {
  const completed = estimateCompletion({
    remainingTopics: 0,
    completedTopicsInWindow: 0,
    today: '2026-11-15',
    examDate: '2026-11-20',
  })
  assert.equal(completed.estimated_completion_days, 0)
  assert.equal(completed.projected_completion_date, '2026-11-15')
  assert.equal(completed.status, 'ON_PROJECTED_SCHEDULE')

  const noExamDate = estimateCompletion({
    remainingTopics: 2,
    completedTopicsInWindow: 1,
    today: '2026-11-15',
  })
  assert.equal(noExamDate.estimated_completion_days, 28)
  assert.equal(noExamDate.days_until_exam, null)
  assert.equal(noExamDate.status, 'INSUFFICIENT_DATA')
})

test('forecast counts only completion dates in the inclusive 14-day window', () => {
  const subject = { id: 1, name: 'Biology', semester: 'Fall', exam_date: null }
  const topics = [
    { id: 1, subject_id: 1, status: 'COMPLETED' },
    { id: 2, subject_id: 1, status: 'NOT_STARTED' },
  ]
  const forecast = buildSubjectForecast({
    subject,
    topics,
    completionHistory: [
      { topic_id: 1, completed_at: '2026-11-02' },
      { topic_id: 1, completed_at: '2026-11-03' },
      { topic_id: 2, completed_at: '2026-11-04' },
    ],
    today: '2026-11-15',
    scenarios: [],
  })
  assert.equal(forecast.recent_completed_topics, 1)
  assert.equal(forecast.current_topics_per_day, 0.07)
  assert.equal(forecast.estimated_completion_days, 14)
  assert.equal(forecast.scenarios[0].estimated_completion_days, 14)
  assert.equal(forecast.status, 'INSUFFICIENT_DATA')
})

test('recovery explanation does not imply strong evidence needs reinforcement', () => {
  const result = buildRecommendations({
    today: '2026-11-15',
    topics: [{
      id: 1,
      title: 'Strong but in progress',
      subject_id: 1,
      subject_name: 'Biology',
      status: 'IN_PROGRESS',
      latest_assessment: { evidence_score: 90 },
    }],
  }).recommendations[0]
  assert.match(result.reason, /90%/)
  assert.doesNotMatch(result.reason, /needs reinforcement/)
})

test('recovery and forecast APIs validate queries and retain completion history after topic deletion', async (context) => {
  const db = createDatabase(':memory:')
  const server = createApp(db).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    db.close()
  })

  const subjectId = db.prepare('INSERT INTO subjects (name, semester, exam_date) VALUES (?, ?, ?)').run('Biology', 'Fall', '2026-11-20').lastInsertRowid
  const unitId = db.prepare('INSERT INTO units (subject_id, title) VALUES (?, ?)').run(subjectId, 'Cell biology').lastInsertRowid
  const completedId = db.prepare("INSERT INTO topics (unit_id, title, status, completed_at) VALUES (?, ?, 'COMPLETED', ?)").run(unitId, 'Cell structure', '2026-11-10').lastInsertRowid
  db.prepare("INSERT INTO topics (unit_id, title, status) VALUES (?, ?, 'NOT_STARTED')").run(unitId, 'Cell transport')

  const recoveryResponse = await fetch(`${baseUrl}/recovery/recommendations?date=2026-11-15&limit=3`)
  const recovery = await recoveryResponse.json()
  assert.equal(recoveryResponse.status, 200)
  assert.equal(recovery.data.recommendations[0].action, 'TAKE_KNOWLEDGE_ASSESSMENT')

  const forecastResponse = await fetch(`${baseUrl}/forecast?date=2026-11-15&subjectId=${subjectId}&targetTopicsPerDay=2`)
  const forecast = await forecastResponse.json()
  assert.equal(forecastResponse.status, 200)
  assert.equal(forecast.data.forecasts[0].recent_completed_topics, 1)
  assert.equal(forecast.data.forecasts[0].status, 'AT_RISK_OF_MISSING_DEADLINE')
  assert.equal((await fetch(`${baseUrl}/forecast?date=invalid`)).status, 400)
  assert.equal((await fetch(`${baseUrl}/recovery/recommendations?limit=101`)).status, 400)
  assert.equal((await fetch(`${baseUrl}/forecast?subjectId=999`)).status, 404)

  const deleteResponse = await fetch(`${baseUrl}/topics/${completedId}`, { method: 'DELETE' })
  assert.equal(deleteResponse.status, 204)
  assert.deepEqual(db.prepare('SELECT topic_id, completed_at FROM topic_completion_history').all(), [
    { topic_id: null, completed_at: '2026-11-10' },
  ])
})
