const express = require('express')
const { validate } = require('../middleware/validate')
const { asyncHandler } = require('../middleware/asyncHandler')
const { dateRange, parentParams } = require('../validators/schemas')

function consecutiveStreaks(dates) {
  const values = [...new Set(dates)].sort()
  let longest = 0
  let run = 0
  let previous
  for (const value of values) {
    const current = new Date(`${value}T00:00:00.000Z`)
    const difference = previous ? (current - previous) / 86400000 : null
    run = difference === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = current
  }
  let current = 0
  if (values.length) {
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    if (values.at(-1) === todayKey || values.at(-1) === yesterdayKey) {
      current = 1
      for (let index = values.length - 1; index > 0; index -= 1) {
        const difference = (new Date(`${values[index]}T00:00:00.000Z`) - new Date(`${values[index - 1]}T00:00:00.000Z`)) / 86400000
        if (difference !== 1) break
        current += 1
      }
    }
  }
  return { current_streak: current, longest_streak: longest }
}

function createHabitRouter(db) {
  const router = express.Router()
  router.get('/:habitId/history', validate(parentParams('habit'), 'params'), validate(dateRange, 'query'), asyncHandler(async (req, res) => {
    const { habitId } = req.params
    const habit = await db.prepare('SELECT id FROM habits WHERE id = ?').get(habitId)
    if (!habit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Habit not found.' } })
    const conditions = ['habit_id = ?', 'completed = 1']
    const values = [habitId]
    if (req.query.from) { conditions.push('log_date >= ?'); values.push(req.query.from) }
    if (req.query.to) { conditions.push('log_date <= ?'); values.push(req.query.to) }
    const logs = await db.prepare(`SELECT * FROM habit_logs WHERE ${conditions.join(' AND ')} ORDER BY log_date DESC`).all(...values)
    const allDates = (await db.prepare('SELECT log_date FROM habit_logs WHERE habit_id = ? AND completed = 1 ORDER BY log_date').all(habitId)).map((row) => row.log_date)
    res.json({ data: { logs, ...consecutiveStreaks(allDates) } })
  }))
  return router
}

module.exports = { createHabitRouter }
