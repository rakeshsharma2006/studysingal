function addDays(date, days) {
  const result = new Date(`${date}T00:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function dayOfWeek(date) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay()
}

function scheduledWeekday(date) {
  const day = dayOfWeek(date)
  return day >= 1 && day <= 5
}

function previousWeekday(date) {
  let candidate = addDays(date, -1)
  while (!scheduledWeekday(candidate)) candidate = addDays(candidate, -1)
  return candidate
}

function weekStart(date) {
  const daysSinceMonday = (dayOfWeek(date) + 6) % 7
  return addDays(date, -daysSinceMonday)
}

function calculateDailyStreaks(dates, today) {
  const completed = new Set(dates)
  const values = [...completed].sort()
  let longest = 0
  let run = 0
  let previous
  for (const date of values) {
    run = previous && date === addDays(previous, 1) ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = date
  }
  let anchor = completed.has(today) ? today : addDays(today, -1)
  if (!completed.has(anchor)) return { current_streak: 0, longest_streak: longest, streak_unit: 'days' }
  let current = 0
  while (completed.has(anchor)) {
    current += 1
    anchor = addDays(anchor, -1)
  }
  return { current_streak: current, longest_streak: longest, streak_unit: 'days' }
}

function calculateWeekdayStreaks(dates, today) {
  const completed = new Set(dates.filter(scheduledWeekday))
  const values = [...completed].sort()
  let longest = 0
  let run = 0
  let previous
  for (const date of values) {
    run = previous && date === previousWeekday(date) ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = date
  }
  let anchor = scheduledWeekday(today) && completed.has(today) ? today : previousWeekday(today)
  if (!completed.has(anchor)) return { current_streak: 0, longest_streak: longest, streak_unit: 'weekdays' }
  let current = 0
  while (completed.has(anchor)) {
    current += 1
    anchor = previousWeekday(anchor)
  }
  return { current_streak: current, longest_streak: longest, streak_unit: 'weekdays' }
}

function calculateWeeklyStreaks(dates, today) {
  const completedWeeks = new Set(dates.map(weekStart))
  const values = [...completedWeeks].sort()
  let longest = 0
  let run = 0
  let previous
  for (const week of values) {
    run = previous && week === addDays(previous, 7) ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = week
  }
  const currentWeek = weekStart(today)
  const isCurrentWeekComplete = completedWeeks.has(currentWeek)
  const weekEndsToday = dayOfWeek(today) === 0
  let anchor = isCurrentWeekComplete
    ? currentWeek
    : weekEndsToday ? null : addDays(currentWeek, -7)
  let current = 0
  while (anchor && completedWeeks.has(anchor)) {
    current += 1
    anchor = addDays(anchor, -7)
  }
  return { current_streak: current, longest_streak: longest, streak_unit: 'weeks' }
}

function calculateHabitStreaks(dates, frequency = 'DAILY', today) {
  const uniqueDates = [...new Set(dates)]
  if (frequency === 'WEEKLY') return calculateWeeklyStreaks(uniqueDates, today)
  if (frequency === 'WEEKDAYS') return calculateWeekdayStreaks(uniqueDates, today)
  return calculateDailyStreaks(uniqueDates, today)
}

module.exports = {
  addDays,
  weekStart,
  calculateHabitStreaks,
}
