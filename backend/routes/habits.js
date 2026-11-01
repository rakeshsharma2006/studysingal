const express = require('express')
const { validate } = require('../middleware/validate')
const { asyncHandler } = require('../middleware/asyncHandler')
const { dateRange, parentParams } = require('../validators/schemas')
const { calculateHabitStreaks } = require('../services/habitStreaks')
const { todayLocal } = require('../utils/date')

function createHabitRouter(db) {
  const router = express.Router()
  router.get('/:habitId/history', validate(parentParams('habit'), 'params'), validate(dateRange, 'query'), asyncHandler(async (req, res) => {
    const { habitId } = req.params
    const habit = await db.prepare('SELECT id, frequency FROM habits WHERE id = ?').get(habitId)
    if (!habit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Habit not found.' } })
    const conditions = ['habit_id = ?', 'completed = 1']
    const values = [habitId]
    if (req.query.from) { conditions.push('log_date >= ?'); values.push(req.query.from) }
    if (req.query.to) { conditions.push('log_date <= ?'); values.push(req.query.to) }
    const logs = await db.prepare(`SELECT * FROM habit_logs WHERE ${conditions.join(' AND ')} ORDER BY log_date DESC`).all(...values)
    const allDates = (await db.prepare('SELECT log_date FROM habit_logs WHERE habit_id = ? AND completed = 1 ORDER BY log_date').all(habitId)).map((row) => row.log_date)
    res.json({ data: { logs, ...calculateHabitStreaks(allDates, habit.frequency, todayLocal()) } })
  }))
  return router
}

module.exports = { createHabitRouter }
