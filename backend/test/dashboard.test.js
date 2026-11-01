const assert = require('node:assert/strict')
const test = require('node:test')
const { createApp } = require('../app')
const { createDatabase } = require('../database')
const { createDemoData, resetDemoData } = require('../scripts/demoData')
const {
  getCurrentStreak,
  isHabitScheduled,
  getDashboardData,
} = require('../services/dashboard/dashboardService')

test('dashboard helpers keep calendar dates and habit schedules consistent', () => {
  assert.equal(isHabitScheduled('DAILY', '2026-11-01'), true)
  assert.equal(isHabitScheduled('WEEKDAYS', '2026-11-01'), false)
  assert.equal(isHabitScheduled('WEEKDAYS', '2026-11-02'), true)
  assert.equal(isHabitScheduled('WEEKLY', '2026-11-01'), false)
  assert.equal(getCurrentStreak(['2026-10-30', '2026-10-31', '2026-11-01'], '2026-11-01'), 3)
  assert.equal(getCurrentStreak(['2026-10-30'], '2026-11-01'), 0)
  assert.equal(getCurrentStreak(['2026-10-31'], '2026-11-01'), 1)
})

test('dashboard API returns real empty states and database-derived academic summaries', async (context) => {
  const db = createDatabase(':memory:')
  const server = createApp(db).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/dashboard`
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    db.close()
  })

  const emptyResponse = await fetch(`${baseUrl}?date=2026-11-01`)
  const empty = (await emptyResponse.json()).data
  assert.equal(emptyResponse.status, 200)
  assert.equal(empty.overview.syllabus.completion_percent, null)
  assert.equal(empty.overview.knowledge.average_evidence_score, null)
  assert.equal(empty.overview.habits.consistency_percent, null)
  assert.equal(empty.today.tasks.length, 0)
  assert.equal(empty.recommendations.length, 0)
  assert.equal(empty.signals.upcoming_exams.length, 0)
  assert.equal(empty.analytics.daily_study.length, 7)
  assert.equal(empty.analytics.daily_study.every((day) => day.actual_minutes === 0 && day.planned_minutes === 0), true)
  assert.equal(empty.analytics.assessment_trend.length, 7)
  assert.equal((await fetch(`${baseUrl}?date=not-a-date`)).status, 400)

  const subjectId = db.prepare(`
    INSERT INTO subjects (name, semester, exam_date) VALUES ('Biology', 'Fall', '2026-11-04')
  `).run().lastInsertRowid
  const unitId = db.prepare(`
    INSERT INTO units (subject_id, title) VALUES (?, 'Cell biology')
  `).run(subjectId).lastInsertRowid
  const completedTopicId = db.prepare(`
    INSERT INTO topics (unit_id, title, status, completed_at)
    VALUES (?, 'Cell structure', 'COMPLETED', '2026-10-30')
  `).run(unitId).lastInsertRowid
  const plannedTopicId = db.prepare(`
    INSERT INTO topics (unit_id, title, status) VALUES (?, 'Cell transport', 'NOT_STARTED')
  `).run(unitId).lastInsertRowid
  db.prepare(`
    INSERT INTO topic_assessments (topic_id, quiz_score, recall_score, created_at)
    VALUES (?, 80, 80, '2026-10-30T12:00:00.000Z')
  `).run(completedTopicId)
  const dailyHabitId = db.prepare(`
    INSERT INTO habits (name, frequency) VALUES ('Daily review', 'DAILY')
  `).run().lastInsertRowid
  const weeklyHabitId = db.prepare(`
    INSERT INTO habits (name, frequency) VALUES ('Weekly recap', 'WEEKLY')
  `).run().lastInsertRowid
  db.prepare(`
    INSERT INTO habit_logs (habit_id, log_date, completed) VALUES (?, '2026-11-01', 1), (?, '2026-10-30', 1), (?, '2026-11-01', 1)
  `).run(dailyHabitId, dailyHabitId, weeklyHabitId)
  db.prepare(`
    INSERT INTO study_plans (topic_id, plan_date, planned_minutes, status)
    VALUES (?, '2026-11-01', 40, 'PLANNED'), (?, '2026-11-01', 30, 'COMPLETED')
  `).run(plannedTopicId, completedTopicId)
  db.prepare(`
    INSERT INTO study_sessions (topic_id, started_at, ended_at, duration_minutes, session_date)
    VALUES (?, '2026-11-01T10:00:00.000Z', '2026-11-01T10:35:00.000Z', 35, '2026-11-01')
  `).run(completedTopicId)
  db.prepare(`
    INSERT INTO revision_tasks (topic_id, due_date, status)
    VALUES (?, '2026-10-31', 'PENDING')
  `).run(completedTopicId)

  const data = await getDashboardData(db, '2026-11-01')
  assert.equal(data.overview.syllabus.total_topics, 2)
  assert.equal(data.overview.syllabus.completed_topics, 1)
  assert.equal(data.overview.syllabus.completion_percent, 50)
  assert.equal(data.overview.knowledge.average_evidence_score, 80)
  assert.equal(data.overview.knowledge.verified_topics, 1)
  assert.equal(data.overview.habits.consistency_percent, 38)
  assert.equal(data.habits.current_streak, 1)
  assert.equal(data.habits.today.length, 2)
  assert.equal(data.habits.weekly_completion_percent, 38)
  assert.equal(data.today.planned_minutes, 70)
  assert.equal(data.today.completed_minutes, 35)
  assert.equal(data.today.planned_tasks, 2)
  assert.equal(data.today.completed_tasks, 1)
  assert.equal(data.analytics.daily_study.at(-1).actual_minutes, 35)
  assert.equal(data.analytics.daily_study.at(-1).session_count, 1)
  assert.equal(data.analytics.subject_duration[0].total_minutes, 35)
  assert.equal(data.analytics.assessment_trend.find((day) => day.date === '2026-10-30').average_evidence_score, 80)
  assert.equal(data.signals.debt.overdue_revision_count, 1)
  assert.equal(data.signals.overdue_revisions[0].topic_title, 'Cell structure')
  assert.equal(data.signals.upcoming_exams[0].days_until_exam, 3)
  assert.equal(data.signals.upcoming_exams[0].status, 'AT_RISK_OF_MISSING_DEADLINE')
  assert.equal(data.recommendations[0].topic_id, plannedTopicId)
})

test('optional demo dataset is repeatable and reset preserves non-demo records', async () => {
  const db = createDatabase(':memory:')
  try {
    const retainedSubject = db.prepare(`
      INSERT INTO subjects (name, semester) VALUES ('Personal Biology', 'Fall')
    `).run()
    const retainedHabit = db.prepare(`
      INSERT INTO habits (name, frequency) VALUES ('Personal habit', 'DAILY')
    `).run()

    const summary = createDemoData(db, '2026-11-01')
    createDemoData(db, '2026-11-01')
    assert.deepEqual(summary, {
      subjects: 4,
      habits: 6,
      activity_days: 14,
      demo_prefix: 'Demo: ',
    })
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM subjects WHERE name LIKE 'Demo: %'").get().count, 4)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM habits WHERE name LIKE 'Demo: %'").get().count, 6)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM study_plans sp JOIN topics t ON t.id = sp.topic_id JOIN units u ON u.id = t.unit_id JOIN subjects s ON s.id = u.subject_id WHERE s.name LIKE 'Demo: %'").get().count, 14)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM topic_assessments ta JOIN topics t ON t.id = ta.topic_id JOIN units u ON u.id = t.unit_id JOIN subjects s ON s.id = u.subject_id WHERE s.name LIKE 'Demo: %'").get().count, 12)
    assert.equal((await getDashboardData(db, '2026-11-01')).demo_data_active, true)

    const demoTopicId = db.prepare(`
      SELECT t.id FROM topics t JOIN units u ON u.id = t.unit_id
      JOIN subjects s ON s.id = u.subject_id WHERE s.name LIKE 'Demo: %' LIMIT 1
    `).get().id
    for (const table of ['topic_assessments', 'revision_tasks', 'study_sessions', 'study_plans']) {
      db.prepare(`DELETE FROM ${table} WHERE topic_id = ?`).run(demoTopicId)
    }
    db.prepare('DELETE FROM topics WHERE id = ?').run(demoTopicId)

    db.transaction(() => resetDemoData(db))()
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM subjects WHERE id = ?').get(retainedSubject.lastInsertRowid).count, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM habits WHERE id = ?').get(retainedHabit.lastInsertRowid).count, 1)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM subjects WHERE name LIKE 'Demo: %'").get().count, 0)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM habits WHERE name LIKE 'Demo: %'").get().count, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM topic_completion_history WHERE topic_id IS NULL').get().count, 0)
    assert.equal((await getDashboardData(db, '2026-11-01')).demo_data_active, false)
  } finally {
    db.close()
  }
})
