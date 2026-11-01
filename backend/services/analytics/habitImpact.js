const { todayLocal } = require('../../utils/date')
const { calculateEvidenceScore } = require('./knowledgeConfidence')

const MIN_GROUP_OBSERVATIONS = 5

function nextCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function average(values) {
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function summarizeGroup(observations) {
  return {
    observation_days: observations.length,
    average_study_minutes: average(observations.map((item) => item.study_minutes)),
    average_sessions: average(observations.map((item) => item.session_count)),
    assessment_days: observations.filter((item) => item.assessment_score != null).length,
    average_assessment_score: average(observations.map((item) => item.assessment_score).filter((value) => value != null)),
  }
}

function compareHabitGroups(completedDays = [], otherDays = []) {
  const completed = summarizeGroup(completedDays)
  const other = summarizeGroup(otherDays)
  const enoughStudyObservations = completed.observation_days >= MIN_GROUP_OBSERVATIONS
    && other.observation_days >= MIN_GROUP_OBSERVATIONS
  const enoughAssessmentObservations = completed.assessment_days >= MIN_GROUP_OBSERVATIONS
    && other.assessment_days >= MIN_GROUP_OBSERVATIONS
  return {
    enough_data: enoughStudyObservations,
    completed_habit_days: completed,
    other_days: other,
    differences: enoughStudyObservations ? {
      average_study_minutes: Math.round((completed.average_study_minutes - other.average_study_minutes) * 10) / 10,
      average_sessions: Math.round((completed.average_sessions - other.average_sessions) * 10) / 10,
      average_assessment_score: enoughAssessmentObservations
        ? Math.round((completed.average_assessment_score - other.average_assessment_score) * 10) / 10
        : null,
    } : null,
    assessment_comparison_available: enoughAssessmentObservations,
    message: enoughStudyObservations
      ? 'Observed patterns are descriptive and do not show that habit completion caused the difference.'
      : 'Not enough data to identify a reliable pattern.',
  }
}

function getHabitImpact(db, { today = todayLocal(), days = 30 } = {}) {
  const start = new Date(`${today}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const rangeStart = start.toISOString().slice(0, 10)
  const rows = db.prepare(`
    SELECT h.id AS habit_id, h.name AS habit_name, h.is_active,
      hl.log_date, hl.completed
    FROM habits h LEFT JOIN habit_logs hl
      ON hl.habit_id = h.id AND hl.log_date BETWEEN ? AND ? AND hl.completed = 1
    ORDER BY h.id, hl.log_date
  `).all(rangeStart, today)
  const sessions = db.prepare(`
    SELECT session_date, SUM(duration_minutes) AS study_minutes, COUNT(*) AS session_count
    FROM study_sessions WHERE session_date BETWEEN ? AND ?
    GROUP BY session_date
  `).all(rangeStart, today)
  const assessmentRows = db.prepare(`
    SELECT date(created_at) AS assessment_date, quiz_score, recall_score, confidence, confidence_rating
    FROM topic_assessments WHERE date(created_at) BETWEEN ? AND ?
  `).all(rangeStart, today)

  const sessionsByDate = new Map(sessions.map((row) => [row.session_date, row]))
  const assessmentsByDate = new Map()
  for (const row of assessmentRows) {
    const result = calculateEvidenceScore(row)
    if (result.evidence_score == null) continue
    const scores = assessmentsByDate.get(row.assessment_date) || []
    scores.push(result.evidence_score)
    assessmentsByDate.set(row.assessment_date, scores)
  }
  const completionByHabit = new Map()
  for (const row of rows) {
    if (!completionByHabit.has(row.habit_id)) completionByHabit.set(row.habit_id, { name: row.habit_name, completed: new Set() })
    if (row.log_date) completionByHabit.get(row.habit_id).completed.add(row.log_date)
  }

  return [...completionByHabit].map(([habitId, habit]) => {
    const completedDays = []
    const otherDays = []
    for (let date = rangeStart; date <= today; date = nextCalendarDate(date)) {
      const session = sessionsByDate.get(date)
      const scores = assessmentsByDate.get(date) || []
      const observation = {
        study_minutes: session?.study_minutes || 0,
        session_count: session?.session_count || 0,
        assessment_score: scores.length ? average(scores) : null,
      }
      if (habit.completed.has(date)) completedDays.push(observation)
      else otherDays.push(observation)
    }
    return {
      habit_id: habitId,
      habit_name: habit.name,
      observation_window_days: days,
      ...compareHabitGroups(completedDays, otherDays),
    }
  })
}

module.exports = { MIN_GROUP_OBSERVATIONS, compareHabitGroups, getHabitImpact }
