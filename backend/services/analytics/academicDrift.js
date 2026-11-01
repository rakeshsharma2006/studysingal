const { todayLocal } = require('../../utils/date')

function calculateTimeDrift(plannedMinutes, actualMinutes) {
  if (plannedMinutes === 0) return null
  return Math.round(Math.max(0, (plannedMinutes - actualMinutes) / plannedMinutes) * 1000) / 10
}

function calculateTaskDrift(plannedTasks, completedTasks) {
  if (plannedTasks === 0) return null
  return Math.round(Math.max(0, (plannedTasks - completedTasks) / plannedTasks) * 1000) / 10
}

function calculateDrift({ plannedMinutes, actualMinutes, plannedTasks, completedTasks }) {
  return {
    planned_minutes: plannedMinutes,
    actual_minutes: actualMinutes,
    planned_tasks: plannedTasks,
    completed_tasks: completedTasks,
    time_drift_percentage: calculateTimeDrift(plannedMinutes, actualMinutes),
    task_drift_percentage: calculateTaskDrift(plannedTasks, completedTasks),
  }
}

function addCalendarDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function getReportRange(period = 'daily', date = todayLocal()) {
  if (period === 'daily') return { from: date, to: date }
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  const from = addCalendarDays(date, -daysSinceMonday)
  return { from, to: addCalendarDays(from, 6) }
}

async function getAcademicDrift(db, { period = 'daily', date = todayLocal() } = {}) {
  const range = getReportRange(period, date)
  const [planned, actual] = await Promise.all([db.prepare(`
    SELECT COALESCE(SUM(planned_minutes), 0) AS planned_minutes,
      COUNT(*) AS planned_tasks,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_tasks
    FROM study_plans WHERE plan_date BETWEEN ? AND ?
  `).get(range.from, range.to), db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) AS actual_minutes
    FROM study_sessions WHERE session_date BETWEEN ? AND ?
  `).get(range.from, range.to)])
  return {
    period,
    ...range,
    ...calculateDrift({
      plannedMinutes: planned.planned_minutes,
      actualMinutes: actual.actual_minutes,
      plannedTasks: planned.planned_tasks,
      completedTasks: planned.completed_tasks || 0,
    }),
  }
}

module.exports = { calculateTimeDrift, calculateTaskDrift, calculateDrift, getReportRange, getAcademicDrift }
