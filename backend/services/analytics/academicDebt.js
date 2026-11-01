const { todayLocal } = require('../../utils/date')

const PRIORITY_WEIGHTS = Object.freeze({ LOW: 1, MEDIUM: 2, HIGH: 3 })

function calendarDaysBetween(from, to) {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000)
}

function calculateStudyTaskDebt(task, today) {
  const overdueDays = Math.min(7, Math.max(1, calendarDaysBetween(task.plan_date, today)))
  return PRIORITY_WEIGHTS[task.priority] * overdueDays
}

function calculateRevisionDebt(task, today) {
  const overdueDays = Math.min(7, Math.max(1, calendarDaysBetween(task.due_date, today)))
  return 2 * overdueDays
}

function calculateAcademicDebt({ studyTasks = [], revisionTasks = [], today = todayLocal() }) {
  const overdueStudy = studyTasks.filter((task) => task.status === 'PLANNED' && task.plan_date < today)
  const skippedStudy = studyTasks.filter((task) => task.status === 'SKIPPED')
  const overdueRevisions = revisionTasks.filter((task) => task.status === 'PENDING' && task.due_date < today)

  const studyBreakdown = [...overdueStudy, ...skippedStudy].map((task) => ({
    type: task.status === 'SKIPPED' ? 'SKIPPED_STUDY_TASK' : 'OVERDUE_STUDY_TASK',
    id: task.id,
    topic_id: task.topic_id,
    due_date: task.plan_date,
    priority: task.priority,
    overdue_days: Math.min(7, Math.max(1, calendarDaysBetween(task.plan_date, today))),
    debt_points: calculateStudyTaskDebt(task, today),
  }))
  const revisionBreakdown = overdueRevisions.map((task) => ({
    type: 'OVERDUE_REVISION_TASK',
    id: task.id,
    topic_id: task.topic_id,
    due_date: task.due_date,
    overdue_days: Math.min(7, Math.max(1, calendarDaysBetween(task.due_date, today))),
    debt_points: calculateRevisionDebt(task, today),
  }))
  const breakdown = [...studyBreakdown, ...revisionBreakdown].sort((a, b) => a.due_date.localeCompare(b.due_date))
  const oldest = [...overdueStudy, ...skippedStudy.filter((task) => task.plan_date < today), ...overdueRevisions].sort((a, b) => (
    (a.plan_date || a.due_date).localeCompare(b.plan_date || b.due_date)
  ))[0]

  return {
    total_debt_points: breakdown.reduce((total, item) => total + item.debt_points, 0),
    overdue_task_count: overdueStudy.length,
    skipped_task_count: skippedStudy.length,
    overdue_revision_count: overdueRevisions.length,
    oldest_overdue_task: oldest ? {
      id: oldest.id,
      topic_id: oldest.topic_id,
      due_date: oldest.plan_date || oldest.due_date,
      type: oldest.plan_date ? 'STUDY_TASK' : 'REVISION_TASK',
    } : null,
    breakdown,
    disclaimer: 'An organizational indicator, not a measure of student intelligence or personal worth.',
  }
}

function getAcademicDebt(db, today = todayLocal()) {
  const studyTasks = db.prepare(`
    SELECT sp.id, sp.topic_id, sp.plan_date, sp.priority, sp.status, t.title AS topic_title
    FROM study_plans sp JOIN topics t ON t.id = sp.topic_id
    WHERE (sp.status = 'PLANNED' AND sp.plan_date < ?) OR sp.status = 'SKIPPED'
  `).all(today)
  const revisionTasks = db.prepare(`
    SELECT rt.id, rt.topic_id, rt.due_date, rt.status, t.title AS topic_title
    FROM revision_tasks rt JOIN topics t ON t.id = rt.topic_id
    WHERE rt.status = 'PENDING' AND rt.due_date < ?
  `).all(today)
  return calculateAcademicDebt({ studyTasks, revisionTasks, today })
}

module.exports = {
  PRIORITY_WEIGHTS,
  calculateStudyTaskDebt,
  calculateRevisionDebt,
  calculateAcademicDebt,
  getAcademicDebt,
}
