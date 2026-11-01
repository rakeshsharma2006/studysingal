const { createDatabase } = require('../database')
const { todayLocal, isValidDate } = require('../utils/date')
const { addCalendarDays } = require('../services/forecast/examForecast')

const DEMO_PREFIX = 'Demo: '
const SUBJECTS = [
  { name: 'Biology', daysToExam: 12 },
  { name: 'Statistics', daysToExam: 24 },
  { name: 'History', daysToExam: 39 },
  { name: 'Chemistry', daysToExam: 55 },
]
const HABITS = [
  { name: 'Focused reading', frequency: 'DAILY' },
  { name: 'Recall practice', frequency: 'DAILY' },
  { name: 'Review notes', frequency: 'DAILY' },
  { name: 'Plan tomorrow', frequency: 'DAILY' },
  { name: 'Weekday problem set', frequency: 'WEEKDAYS' },
  { name: 'Weekly recap', frequency: 'WEEKLY' },
]

function ensureDemoRegistry(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_dataset_completion_history (
      history_id INTEGER PRIMARY KEY REFERENCES topic_completion_history(id) ON DELETE CASCADE
    )
  `)
}

function resetDemoData(db) {
  ensureDemoRegistry(db)
  const registeredHistoryIds = db.prepare('SELECT history_id FROM demo_dataset_completion_history').all().map((row) => row.history_id)
  if (registeredHistoryIds.length) {
    const placeholders = registeredHistoryIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM topic_completion_history WHERE id IN (${placeholders})`).run(...registeredHistoryIds)
  }
  const subjectIds = db.prepare('SELECT id FROM subjects WHERE name LIKE ?').all(`${DEMO_PREFIX}%`).map((row) => row.id)
  const topicIds = subjectIds.length
    ? db.prepare(`SELECT t.id FROM topics t JOIN units u ON u.id = t.unit_id WHERE u.subject_id IN (${subjectIds.map(() => '?').join(',')})`).all(...subjectIds).map((row) => row.id)
    : []

  if (topicIds.length) {
    const placeholders = topicIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM topic_completion_history WHERE topic_id IN (${placeholders})`).run(...topicIds)
    for (const table of ['revision_tasks', 'topic_assessments', 'study_sessions', 'study_plans']) {
      db.prepare(`DELETE FROM ${table} WHERE topic_id IN (${placeholders})`).run(...topicIds)
    }
    db.prepare(`DELETE FROM topics WHERE id IN (${placeholders})`).run(...topicIds)
  }
  if (subjectIds.length) {
    const placeholders = subjectIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM units WHERE subject_id IN (${placeholders})`).run(...subjectIds)
    db.prepare(`DELETE FROM subjects WHERE id IN (${placeholders})`).run(...subjectIds)
  }
  const habitIds = db.prepare('SELECT id FROM habits WHERE name LIKE ?').all(`${DEMO_PREFIX}%`).map((row) => row.id)
  if (habitIds.length) {
    const placeholders = habitIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM habit_logs WHERE habit_id IN (${placeholders})`).run(...habitIds)
    db.prepare(`DELETE FROM habits WHERE id IN (${placeholders})`).run(...habitIds)
  }
}

function createDemoData(db, today = todayLocal()) {
  if (!isValidDate(today)) throw new RangeError('Demo data date must be a valid YYYY-MM-DD date.')
  const run = db.transaction(() => {
    ensureDemoRegistry(db)
    resetDemoData(db)
    const insertSubject = db.prepare('INSERT INTO subjects (name, semester, exam_date) VALUES (?, ?, ?)')
    const insertUnit = db.prepare('INSERT INTO units (subject_id, title, position) VALUES (?, ?, ?)')
    const insertTopic = db.prepare(`
      INSERT INTO topics (unit_id, title, status, priority, estimated_minutes, completed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const insertHabit = db.prepare('INSERT INTO habits (name, frequency, is_active) VALUES (?, ?, 1)')
    const insertHabitLog = db.prepare('INSERT INTO habit_logs (habit_id, log_date, completed) VALUES (?, ?, ?)')
    const insertPlan = db.prepare(`
      INSERT INTO study_plans (topic_id, plan_date, planned_minutes, priority, status)
      VALUES (?, ?, ?, ?, ?)
    `)
    const insertSession = db.prepare(`
      INSERT INTO study_sessions (topic_id, started_at, ended_at, duration_minutes, session_date)
      VALUES (?, ?, ?, ?, ?)
    `)
    const insertAssessment = db.prepare(`
      INSERT INTO topic_assessments (topic_id, quiz_score, recall_score, confidence_rating, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    const insertRevision = db.prepare(`
      INSERT INTO revision_tasks (topic_id, due_date, status, completed_at, recall_score)
      VALUES (?, ?, ?, ?, ?)
    `)
    const subjects = []

    SUBJECTS.forEach((definition, subjectIndex) => {
      const examDate = addCalendarDays(today, definition.daysToExam)
      const subjectId = Number(insertSubject.run(`${DEMO_PREFIX}${definition.name}`, 'Demo term', examDate).lastInsertRowid)
      const topics = []
      for (let unitIndex = 0; unitIndex < 2; unitIndex += 1) {
        const unitId = Number(insertUnit.run(subjectId, `Unit ${unitIndex + 1}`, unitIndex).lastInsertRowid)
        for (let topicIndex = 0; topicIndex < 3; topicIndex += 1) {
          const index = unitIndex * 3 + topicIndex
          const status = index === 0 ? 'COMPLETED' : index === 1 ? 'IN_PROGRESS' : 'NOT_STARTED'
          const completedAt = status === 'COMPLETED' ? addCalendarDays(today, -subjectIndex - 1) : null
          const priority = index % 3 === 0 ? 'HIGH' : index % 3 === 1 ? 'MEDIUM' : 'LOW'
          const id = Number(insertTopic.run(
            unitId,
            `${definition.name} topic ${index + 1}`,
            status,
            priority,
            25 + (index % 3) * 10,
            completedAt,
          ).lastInsertRowid)
          topics.push({ id, index, status })
          if (status === 'COMPLETED') {
            const history = db.prepare(`
              SELECT id FROM topic_completion_history
              WHERE topic_id = ? AND completed_at = ?
              ORDER BY id DESC LIMIT 1
            `).get(id, completedAt)
            if (history) db.prepare('INSERT OR IGNORE INTO demo_dataset_completion_history (history_id) VALUES (?)').run(history.id)
          }
        }
      }
      subjects.push({ ...definition, id: subjectId, topics })

      const scoredTopic = topics[0]
      insertAssessment.run(
        scoredTopic.id,
        54 + subjectIndex * 5,
        58 + subjectIndex * 4,
        2 + (subjectIndex % 3),
        `${addCalendarDays(today, -6)}T10:00:00.000Z`,
      )
      insertAssessment.run(
        scoredTopic.id,
        62 + subjectIndex * 5,
        68 + subjectIndex * 4,
        3 + (subjectIndex % 2),
        `${addCalendarDays(today, -2)}T10:30:00.000Z`,
      )
      insertAssessment.run(
        topics[1].id,
        44 + subjectIndex * 6,
        50 + subjectIndex * 5,
        2,
        `${addCalendarDays(today, -1)}T11:00:00.000Z`,
      )
      insertRevision.run(topics[0].id, addCalendarDays(today, -3), 'PENDING', null, null)
      insertRevision.run(topics[1].id, addCalendarDays(today, 2), 'PENDING', null, null)
    })

    HABITS.forEach((habit) => {
      const habitId = Number(insertHabit.run(`${DEMO_PREFIX}${habit.name}`, habit.frequency).lastInsertRowid)
      for (let daysAgo = 0; daysAgo < 14; daysAgo += 1) {
        const date = addCalendarDays(today, -daysAgo)
        const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
        if (habit.frequency === 'WEEKDAYS' && (weekday === 0 || weekday === 6)) continue
        if (habit.frequency === 'WEEKLY' && daysAgo % 7 !== 0) continue
        const completed = habit.frequency === 'WEEKLY' || (daysAgo + HABITS.indexOf(habit)) % 5 !== 3
        insertHabitLog.run(habitId, date, completed ? 1 : 0)
      }
    })

    for (let daysAgo = 0; daysAgo < 14; daysAgo += 1) {
      const date = addCalendarDays(today, -daysAgo)
      const subject = subjects[daysAgo % subjects.length]
      const topic = subject.topics[(daysAgo + 2) % subject.topics.length]
      const status = daysAgo % 5 === 0 ? 'SKIPPED' : daysAgo % 3 === 0 ? 'PLANNED' : 'COMPLETED'
      insertPlan.run(topic.id, date, 35 + (daysAgo % 3) * 10, daysAgo % 4 === 0 ? 'HIGH' : 'MEDIUM', status)
      if (daysAgo % 4 !== 3) {
        const minutes = 25 + (daysAgo % 4) * 10
        insertSession.run(
          topic.id,
          `${date}T09:00:00.000Z`,
          `${date}T${String(9 + Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00.000Z`,
          minutes,
          date,
        )
      }
    }
  })
  run()
  return {
    subjects: SUBJECTS.length,
    habits: HABITS.length,
    activity_days: 14,
    demo_prefix: DEMO_PREFIX,
  }
}

function main() {
  const command = process.argv[2]
  if (!['seed', 'reset'].includes(command)) {
    console.error('Usage: node scripts/demoData.js <seed|reset>')
    process.exitCode = 1
    return
  }
  const db = createDatabase()
  try {
    if (command === 'reset') {
      db.transaction(() => resetDemoData(db))()
      console.log('Demo dataset records have been removed.')
    } else {
      console.log(`Demo dataset ready: ${JSON.stringify(createDemoData(db))}`)
    }
  } finally {
    db.close()
  }
}

if (require.main === module) main()

module.exports = { DEMO_PREFIX, SUBJECTS, HABITS, resetDemoData, createDemoData }
