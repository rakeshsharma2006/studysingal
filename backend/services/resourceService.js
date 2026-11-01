const tableColumns = {
  subjects: ['name', 'semester', 'exam_date'],
  units: ['subject_id', 'title', 'position'],
  topics: ['unit_id', 'title', 'status', 'priority', 'estimated_minutes', 'completed_at'],
  habits: ['name', 'frequency', 'is_active'],
  habit_logs: ['habit_id', 'log_date', 'completed'],
  study_plans: ['topic_id', 'plan_date', 'planned_minutes', 'priority', 'status'],
  study_sessions: ['topic_id', 'started_at', 'ended_at', 'duration_minutes', 'session_date'],
  topic_assessments: ['topic_id', 'quiz_score', 'recall_score', 'confidence', 'confidence_rating'],
  revision_tasks: ['topic_id', 'due_date', 'status', 'completed_at', 'recall_score'],
}
const { todayLocal } = require('../utils/date')

function toDatabaseValue(value) {
  return typeof value === 'boolean' ? Number(value) : value
}

function mapRow(name, row) {
  if (!row) return row
  if (name === 'habits') return { ...row, is_active: Boolean(row.is_active) }
  if (name === 'habit_logs') return { ...row, completed: Boolean(row.completed) }
  return row
}

function createResourceService(db, name) {
  const columns = tableColumns[name]
  if (!columns) throw new Error(`Unknown resource: ${name}`)

  return {
    async list(filters = {}) {
      if (name === 'habit_logs' || name === 'study_sessions') {
        const dateColumn = name === 'habit_logs' ? 'log_date' : 'session_date'
        const clauses = []
        const values = []
        if (filters.habit_id && name === 'habit_logs') { clauses.push('habit_id = ?'); values.push(Number(filters.habit_id)) }
        if (filters.topic_id && name === 'study_sessions') { clauses.push('topic_id = ?'); values.push(Number(filters.topic_id)) }
        if (filters.date) { clauses.push(`${dateColumn} = ?`); values.push(filters.date) }
        if (filters.from) { clauses.push(`${dateColumn} >= ?`); values.push(filters.from) }
        if (filters.to) { clauses.push(`${dateColumn} <= ?`); values.push(filters.to) }
        const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
        return (await db.prepare(`SELECT * FROM ${name}${where} ORDER BY ${dateColumn} DESC, id DESC`).all(...values))
          .map((row) => mapRow(name, row))
      }
      const filterEntries = Object.entries(filters).filter(([key, value]) => columns.includes(key) && value !== undefined)
      const where = filterEntries.length ? ` WHERE ${filterEntries.map(([key]) => `${key} = @${key}`).join(' AND ')}` : ''
      const rows = await db.prepare(`SELECT * FROM ${name}${where} ORDER BY id DESC`).all(
        Object.fromEntries(filterEntries.map(([key, value]) => [key, toDatabaseValue(value)])),
      )
      return rows.map((row) => mapRow(name, row))
    },
    async get(id) {
      return mapRow(name, await db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(id))
    },
    async create(data) {
      if (name === 'topics' && data.status === 'COMPLETED' && data.completed_at === undefined) {
        data = { ...data, completed_at: todayLocal() }
      }
      const keys = Object.keys(data).filter((key) => columns.includes(key))
      const result = await db.prepare(
        `INSERT INTO ${name} (${keys.join(', ')}) VALUES (${keys.map((key) => `@${key}`).join(', ')})`,
      ).run(Object.fromEntries(keys.map((key) => [key, toDatabaseValue(data[key])])))
      return this.get(Number(result.lastInsertRowid))
    },
    async update(id, data) {
      if (name === 'topics' && data.status === 'COMPLETED' && data.completed_at === undefined) {
        data = { ...data, completed_at: todayLocal() }
      }
      if (name === 'topics' && data.status && data.status !== 'COMPLETED' && data.completed_at === undefined) {
        data = { ...data, completed_at: null }
      }
      if (name === 'revision_tasks' && data.status === 'COMPLETED' && data.completed_at === undefined) {
        data = { ...data, completed_at: todayLocal() }
      }
      if (name === 'revision_tasks' && data.status && data.status !== 'COMPLETED' && data.completed_at === undefined) {
        data = { ...data, completed_at: null }
      }
      const keys = Object.keys(data).filter((key) => columns.includes(key))
      const result = await db.prepare(
        `UPDATE ${name} SET ${keys.map((key) => `${key} = @${key}`).join(', ')} WHERE id = @id`,
      ).run({ ...Object.fromEntries(keys.map((key) => [key, toDatabaseValue(data[key])])), id })
      return result.changes ? this.get(id) : null
    },
    async delete(id) {
      return (await db.prepare(`DELETE FROM ${name} WHERE id = ?`).run(id)).changes > 0
    },
  }
}

module.exports = { createResourceService }
