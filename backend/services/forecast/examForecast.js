const { todayLocal, isValidDate } = require('../../utils/date')

const FORECAST_WINDOW_DAYS = 14
const FORECAST_STATUS = Object.freeze({
  ON_SCHEDULE: 'ON_PROJECTED_SCHEDULE',
  AT_RISK: 'AT_RISK_OF_MISSING_DEADLINE',
  INSUFFICIENT: 'INSUFFICIENT_DATA',
})

function addCalendarDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000)
}

function getForecastWindow(today) {
  return { from: addCalendarDays(today, -(FORECAST_WINDOW_DAYS - 1)), to: today }
}

function estimateCompletion({ remainingTopics, completedTopicsInWindow, today = todayLocal(), examDate = null }) {
  const completionRate = completedTopicsInWindow / FORECAST_WINDOW_DAYS
  if (remainingTopics === 0) {
    const daysUntilExam = examDate && isValidDate(examDate) ? daysBetween(today, examDate) : null
    return {
      remaining_topics: 0,
      completed_topics_in_window: completedTopicsInWindow,
      window_days: FORECAST_WINDOW_DAYS,
      current_topics_per_day: completedTopicsInWindow ? completionRate : null,
      estimated_completion_days: 0,
      projected_completion_date: today,
      days_until_exam: daysUntilExam,
      estimated_buffer_days: daysUntilExam,
      status: examDate ? FORECAST_STATUS.ON_SCHEDULE : FORECAST_STATUS.INSUFFICIENT,
      status_reason: examDate ? 'All currently tracked syllabus topics are complete.' : 'No exam date is set.',
    }
  }

  if (!completedTopicsInWindow) {
    return {
      remaining_topics: remainingTopics,
      completed_topics_in_window: 0,
      window_days: FORECAST_WINDOW_DAYS,
      current_topics_per_day: null,
      estimated_completion_days: null,
      projected_completion_date: null,
      days_until_exam: examDate && isValidDate(examDate) ? daysBetween(today, examDate) : null,
      estimated_buffer_days: null,
      status: FORECAST_STATUS.INSUFFICIENT,
      status_reason: 'Not enough study history to calculate a forecast.',
    }
  }

  const estimatedDays = Math.ceil(remainingTopics / completionRate)
  const projectedDate = addCalendarDays(today, estimatedDays)
  const daysUntilExam = examDate && isValidDate(examDate) ? daysBetween(today, examDate) : null
  const bufferDays = daysUntilExam == null ? null : daysUntilExam - estimatedDays
  const status = daysUntilExam == null
    ? FORECAST_STATUS.INSUFFICIENT
    : estimatedDays <= daysUntilExam ? FORECAST_STATUS.ON_SCHEDULE : FORECAST_STATUS.AT_RISK

  return {
    remaining_topics: remainingTopics,
    completed_topics_in_window: completedTopicsInWindow,
    window_days: FORECAST_WINDOW_DAYS,
    current_topics_per_day: Math.round(completionRate * 100) / 100,
    estimated_completion_days: estimatedDays,
    projected_completion_date: projectedDate,
    days_until_exam: daysUntilExam,
    estimated_buffer_days: bufferDays,
    status,
    status_reason: daysUntilExam == null
      ? 'No valid exam date is available for comparison.'
      : status === FORECAST_STATUS.ON_SCHEDULE
        ? 'The current 14-day completion pace projects completion on or before the exam date.'
        : 'The current 14-day completion pace projects completion after the exam date.',
  }
}

function buildScenario({ remainingTopics, targetTopicsPerDay, today = todayLocal(), examDate = null }) {
  if (!Number.isFinite(targetTopicsPerDay) || targetTopicsPerDay <= 0) {
    throw new RangeError('Scenario study rate must be greater than zero.')
  }
  const days = remainingTopics === 0 ? 0 : Math.ceil(remainingTopics / targetTopicsPerDay)
  const projectedDate = addCalendarDays(today, days)
  const daysUntilExam = examDate && isValidDate(examDate) ? daysBetween(today, examDate) : null
  return {
    target_topics_per_day: targetTopicsPerDay,
    estimated_completion_days: days,
    projected_completion_date: projectedDate,
    days_until_exam: daysUntilExam,
    estimated_buffer_days: daysUntilExam == null ? null : daysUntilExam - days,
    status: daysUntilExam == null
      ? FORECAST_STATUS.INSUFFICIENT
      : days <= daysUntilExam ? FORECAST_STATUS.ON_SCHEDULE : FORECAST_STATUS.AT_RISK,
  }
}

function buildSubjectForecast({
  subject,
  topics = [],
  completionHistory = [],
  sessions = [],
  today = todayLocal(),
  targetTopicsPerDay = 1,
  scenarios = [1, 2],
}) {
  const subjectTopics = topics.filter((topic) => topic.subject_id === subject.id)
  const completedTopics = subjectTopics.filter((topic) => topic.status === 'COMPLETED').length
  const remainingTopics = subjectTopics.length - completedTopics
  const window = getForecastWindow(today)
  const completedEvents = completionHistory.filter((event) => (
    subjectTopics.some((topic) => topic.id === event.topic_id)
    && event.completed_at >= window.from
    && event.completed_at <= window.to
  )).length
  const baseline = estimateCompletion({
    remainingTopics,
    completedTopicsInWindow: completedEvents,
    today,
    examDate: subject.exam_date,
  })
  const recentSessions = sessions.filter((session) => (
    subjectTopics.some((topic) => topic.id === session.topic_id)
    && session.session_date >= window.from
    && session.session_date <= window.to
  ))
  const currentRate = completedEvents ? completedEvents / FORECAST_WINDOW_DAYS : null
  const rates = [...new Set([currentRate, targetTopicsPerDay, ...scenarios]
    .filter((rate) => Number.isFinite(rate) && rate > 0))]

  return {
    subject_id: subject.id,
    subject_name: subject.name,
    semester: subject.semester,
    exam_date: subject.exam_date,
    remaining_topics: remainingTopics,
    completed_topics: completedTopics,
    recent_completed_topics: completedEvents,
    recent_sessions: recentSessions.length,
    recent_study_minutes: recentSessions.reduce((total, session) => total + session.duration_minutes, 0),
    window,
    ...baseline,
    scenarios: rates.map((rate) => ({
      label: rate === currentRate ? 'Current pace' : rate === targetTopicsPerDay ? 'Your scenario' : `${rate} topics/day`,
      ...buildScenario({ remainingTopics, targetTopicsPerDay: rate, today, examDate: subject.exam_date }),
    })),
    assumptions: [
      'Current pace uses completed topic events in the last 14 calendar days divided by 14.',
      'Scenario dates assume a steady target completion rate and round required days upward.',
      'Recent session minutes provide activity context but do not change the completion-rate formula.',
      'This is a transparent estimate, not a guarantee of completion or a prediction of exam marks.',
    ],
  }
}

async function getExamForecast(db, {
  today = todayLocal(),
  subjectId,
  targetTopicsPerDay = 1,
  scenarios = [1, 2],
} = {}) {
  const [subjects, topics, completionHistory, sessions] = await Promise.all([db.prepare(`
    SELECT s.* FROM subjects s
    WHERE (? IS NULL OR s.id = ?)
    ORDER BY s.exam_date IS NULL, s.exam_date, s.name COLLATE NOCASE
  `).all(subjectId || null, subjectId || null), db.prepare(`
    SELECT t.id, t.unit_id, t.status, u.subject_id
    FROM topics t JOIN units u ON u.id = t.unit_id
  `).all(), db.prepare('SELECT topic_id, completed_at FROM topic_completion_history').all(),
  db.prepare('SELECT topic_id, session_date, duration_minutes FROM study_sessions').all()])
  return {
    as_of_date: today,
    forecast_window_days: FORECAST_WINDOW_DAYS,
    forecasts: subjects.map((subject) => buildSubjectForecast({
      subject,
      topics,
      completionHistory,
      sessions,
      today,
      targetTopicsPerDay,
      scenarios,
    })),
  }
}

module.exports = {
  FORECAST_WINDOW_DAYS,
  FORECAST_STATUS,
  addCalendarDays,
  daysBetween,
  getForecastWindow,
  estimateCompletion,
  buildScenario,
  buildSubjectForecast,
  getExamForecast,
}
