const assert = require('node:assert/strict')
const test = require('node:test')
const { calculateHabitStreaks } = require('../services/habitStreaks')

test('daily streaks retain consecutive calendar-day behavior', () => {
  assert.deepEqual(calculateHabitStreaks(
    ['2026-11-13', '2026-11-14'],
    'DAILY',
    '2026-11-15',
  ), { current_streak: 2, longest_streak: 2, streak_unit: 'days' })
  assert.equal(calculateHabitStreaks(['2026-11-13'], 'DAILY', '2026-11-15').current_streak, 0)
})

test('weekday streaks skip weekends and use the prior weekday before today is completed', () => {
  assert.deepEqual(calculateHabitStreaks(
    ['2026-10-30', '2026-11-02'],
    'WEEKDAYS',
    '2026-11-02',
  ), { current_streak: 2, longest_streak: 2, streak_unit: 'weekdays' })
  assert.equal(calculateHabitStreaks(['2026-10-30'], 'WEEKDAYS', '2026-11-02').current_streak, 1)
  assert.equal(calculateHabitStreaks(['2026-10-29'], 'WEEKDAYS', '2026-11-02').current_streak, 0)
})

test('weekly streaks count consecutive Monday-Sunday weeks and allow the unfinished current week', () => {
  assert.deepEqual(calculateHabitStreaks(
    ['2026-10-19', '2026-10-25', '2026-11-02', '2026-11-04'],
    'WEEKLY',
    '2026-11-04',
  ), { current_streak: 3, longest_streak: 3, streak_unit: 'weeks' })
  assert.equal(calculateHabitStreaks(
    ['2026-10-26'],
    'WEEKLY',
    '2026-11-04',
  ).current_streak, 1)
  assert.equal(calculateHabitStreaks(
    ['2026-10-26'],
    'WEEKLY',
    '2026-11-08',
  ).current_streak, 0)
})
