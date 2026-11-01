const assert = require('node:assert/strict')
const test = require('node:test')
const {
  calculateEvidenceScore,
  classifyEvidenceScore,
  confidenceToPercentage,
} = require('../services/analytics/knowledgeConfidence')
const {
  calculateTimeDrift,
  calculateTaskDrift,
  calculateDrift,
  getReportRange,
} = require('../services/analytics/academicDrift')
const { calculateAcademicDebt } = require('../services/analytics/academicDebt')
const { buildKnowledgeAnalysis } = require('../services/analytics/knowledgeGap')
const { compareHabitGroups } = require('../services/analytics/habitImpact')
const { createDatabase } = require('../database')
const { getAnalyticsReport } = require('../services/analytics/analyticsService')

test('confidence mappings and evidence scores handle missing evidence', () => {
  assert.equal(confidenceToPercentage(1), 20)
  assert.equal(confidenceToPercentage(5), 100)
  assert.equal(confidenceToPercentage(0), null)
  assert.equal(calculateEvidenceScore({ quiz_score: 80, recall_score: 60, confidence_rating: 5 }).evidence_score, 78)
  assert.equal(calculateEvidenceScore({ quiz_score: 80, recall_score: 60 }).evidence_score, 74.1)
  assert.equal(calculateEvidenceScore({ quiz_score: 80 }).evidence_score, 80)
  assert.equal(calculateEvidenceScore({ quiz_score: null, recall_score: null, confidence_rating: 5 }).status, 'UNVERIFIED')
  assert.equal(calculateEvidenceScore({}).evidence_score, null)
})

test('knowledge classifications use configurable boundaries', () => {
  const thresholds = { needsAttentionBelow: 40, reinforcementBelow: 65 }
  assert.equal(classifyEvidenceScore(null), 'UNVERIFIED')
  assert.equal(classifyEvidenceScore(49.9), 'NEEDS_ATTENTION')
  assert.equal(classifyEvidenceScore(50), 'REQUIRES_REINFORCEMENT')
  assert.equal(classifyEvidenceScore(69.9), 'REQUIRES_REINFORCEMENT')
  assert.equal(classifyEvidenceScore(70), 'RELATIVELY_STRONG')
  assert.equal(classifyEvidenceScore(39.9, thresholds), 'NEEDS_ATTENTION')
  assert.equal(classifyEvidenceScore(40, thresholds), 'REQUIRES_REINFORCEMENT')
  assert.equal(classifyEvidenceScore(41, thresholds), 'REQUIRES_REINFORCEMENT')
  assert.equal(classifyEvidenceScore(64.9, thresholds), 'REQUIRES_REINFORCEMENT')
  assert.equal(classifyEvidenceScore(65, thresholds), 'RELATIVELY_STRONG')
})

test('drift metrics are independent, zero-safe, and capped at no missed activity', () => {
  assert.equal(calculateTimeDrift(120, 90), 25)
  assert.equal(calculateTimeDrift(0, 10), null)
  assert.equal(calculateTimeDrift(60, 90), 0)
  assert.equal(calculateTaskDrift(4, 1), 75)
  assert.equal(calculateTaskDrift(0, 0), null)
  assert.deepEqual(calculateDrift({
    plannedMinutes: 100,
    actualMinutes: 50,
    plannedTasks: 5,
    completedTasks: 4,
  }), {
    planned_minutes: 100,
    actual_minutes: 50,
    planned_tasks: 5,
    completed_tasks: 4,
    time_drift_percentage: 50,
    task_drift_percentage: 20,
  })
  assert.deepEqual(getReportRange('weekly', '2026-11-01'), { from: '2026-10-26', to: '2026-11-01' })
})

test('debt includes overdue and skipped study tasks, caps days, and ignores completed work', () => {
  const report = calculateAcademicDebt({
    today: '2026-11-01',
    studyTasks: [
      { id: 1, topic_id: 1, plan_date: '2026-10-30', priority: 'HIGH', status: 'PLANNED' },
      { id: 2, topic_id: 2, plan_date: '2026-10-20', priority: 'LOW', status: 'PLANNED' },
      { id: 3, topic_id: 3, plan_date: '2026-10-30', priority: 'MEDIUM', status: 'COMPLETED' },
      { id: 4, topic_id: 4, plan_date: '2026-10-31', priority: 'MEDIUM', status: 'SKIPPED' },
    ],
    revisionTasks: [
      { id: 5, topic_id: 5, due_date: '2026-10-30', status: 'PENDING' },
      { id: 6, topic_id: 6, due_date: '2026-10-31', status: 'COMPLETED' },
    ],
  })
  assert.equal(report.total_debt_points, 6 + 7 + 2 + 4)
  assert.equal(report.overdue_task_count, 2)
  assert.equal(report.skipped_task_count, 1)
  assert.equal(report.overdue_revision_count, 1)
  assert.equal(report.oldest_overdue_task.due_date, '2026-10-20')
  assert.match(report.disclaimer, /organizational indicator/)
})

test('knowledge analysis keeps missing assessments unverified and detects declines', () => {
  const topics = [
    { id: 1, title: 'Unassessed', status: 'COMPLETED' },
    { id: 2, title: 'Weak', status: 'COMPLETED' },
    { id: 3, title: 'Declining', status: 'IN_PROGRESS' },
  ]
  const assessments = [
    { id: 1, topic_id: 2, quiz_score: 40, recall_score: 50, confidence_rating: 2, created_at: '2026-10-30T00:00:00.000Z' },
    { id: 2, topic_id: 3, quiz_score: 90, recall_score: 80, confidence_rating: 5, created_at: '2026-10-29T00:00:00.000Z' },
    { id: 3, topic_id: 3, quiz_score: 60, recall_score: 55, confidence_rating: 3, created_at: '2026-10-30T00:00:00.000Z' },
  ]
  const analysis = buildKnowledgeAnalysis({ topics, assessments, today: '2026-11-01' })
  assert.deepEqual(analysis.unverified_topics.map((topic) => topic.id), [1])
  assert.deepEqual(analysis.completed_topics_with_weak_evidence.map((topic) => topic.id), [2])
  assert.deepEqual(analysis.declining_topics.map((topic) => topic.id), [3])
  assert.equal(analysis.topics.find((topic) => topic.id === 1).classification, 'UNVERIFIED')
})

test('habit analysis refuses comparisons below five observations per group', () => {
  const insufficient = compareHabitGroups(
    Array.from({ length: 4 }, () => ({ study_minutes: 30, session_count: 1, assessment_score: 70 })),
    Array.from({ length: 8 }, () => ({ study_minutes: 10, session_count: 1, assessment_score: 60 })),
  )
  assert.equal(insufficient.differences, null)
  assert.equal(insufficient.message, 'Not enough data to identify a reliable pattern.')

  const sufficient = compareHabitGroups(
    Array.from({ length: 5 }, () => ({ study_minutes: 30, session_count: 2, assessment_score: 75 })),
    Array.from({ length: 5 }, () => ({ study_minutes: 10, session_count: 1, assessment_score: 65 })),
  )
  assert.equal(sufficient.differences.average_study_minutes, 20)
  assert.equal(sufficient.differences.average_sessions, 1)
  assert.equal(sufficient.differences.average_assessment_score, 10)
})

test('empty database analytics return stable zero-data structures', (context) => {
  const db = createDatabase(':memory:')
  context.after(() => db.close())
  const report = getAnalyticsReport(db, { period: 'weekly', date: '2026-11-01', today: '2026-11-01' })
  assert.equal(report.drift.time_drift_percentage, null)
  assert.equal(report.drift.task_drift_percentage, null)
  assert.equal(report.debt.total_debt_points, 0)
  assert.equal(report.knowledge.topics.length, 0)
  assert.deepEqual(report.habit_impact, [])
})
