const { todayLocal } = require('../utils/date')

const ACTIVE_TIMER_STATUSES = ['RUNNING', 'PAUSED']
const MAX_SESSION_MINUTES = 1440

function timerError(code, message, status = 409) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function elapsedSecondsFor(timer, now = new Date()) {
  const accumulated = timer.elapsed_seconds
  if (timer.status !== 'RUNNING' || !timer.segment_started_at) return accumulated
  return accumulated + Math.max(0, Math.floor((now.getTime() - Date.parse(timer.segment_started_at)) / 1000))
}

function presentTimer(timer, now = new Date()) {
  if (!timer) return null
  const currentElapsedSeconds = elapsedSecondsFor(timer, now)
  return {
    ...timer,
    current_elapsed_seconds: currentElapsedSeconds,
    stale: currentElapsedSeconds > MAX_SESSION_MINUTES * 60,
  }
}

async function getActiveTimer(db, now = new Date()) {
  const timer = await db.prepare(`
    SELECT timer.*, topics.title AS topic_title
    FROM study_timer_sessions timer
    JOIN topics ON topics.id = timer.topic_id
    WHERE timer.status IN ('RUNNING', 'PAUSED')
    ORDER BY timer.id DESC
    LIMIT 1
  `).get()
  return presentTimer(timer, now)
}

async function getTimerById(db, id, now = new Date()) {
  return presentTimer(await db.prepare(`
    SELECT timer.*, topics.title AS topic_title
    FROM study_timer_sessions timer
    JOIN topics ON topics.id = timer.topic_id
    WHERE timer.id = ?
  `).get(id), now)
}

async function startTimer(db, { topic_id, session_date = todayLocal() }, now = new Date()) {
  const timestamp = now.toISOString()
  const result = await db.prepare(`
    INSERT INTO study_timer_sessions (topic_id, status, started_at, segment_started_at, session_date)
    VALUES (?, 'RUNNING', ?, ?, ?)
  `).run(topic_id, timestamp, timestamp, session_date)
  return getTimerById(db, Number(result.lastInsertRowid), now)
}

async function pauseTimer(db, id, now = new Date()) {
  const timer = await getTimerById(db, id, now)
  if (!timer || timer.status !== 'RUNNING') throw timerError('TIMER_NOT_RUNNING', 'Only a running timer can be paused.')
  const updated = await db.prepare(`
    UPDATE study_timer_sessions
    SET status = 'PAUSED', elapsed_seconds = ?, segment_started_at = NULL, updated_at = ?
    WHERE id = ? AND status = 'RUNNING'
  `).run(timer.current_elapsed_seconds, now.toISOString(), id)
  if (!updated.changes) throw timerError('TIMER_STATE_CHANGED', 'The timer changed state. Refresh and try again.')
  return getTimerById(db, id, now)
}

async function resumeTimer(db, id, now = new Date()) {
  const timer = await getTimerById(db, id, now)
  if (!timer || timer.status !== 'PAUSED') throw timerError('TIMER_NOT_PAUSED', 'Only a paused timer can be resumed.')
  if (timer.stale) {
    throw timerError('TIMER_TOO_LONG', 'This timer exceeds the 24-hour session limit. Discard it and start a new session.', 400)
  }
  const updated = await db.prepare(`
    UPDATE study_timer_sessions
    SET status = 'RUNNING', segment_started_at = ?, updated_at = ?
    WHERE id = ? AND status = 'PAUSED'
  `).run(now.toISOString(), now.toISOString(), id)
  if (!updated.changes) throw timerError('TIMER_NOT_PAUSED', 'Only a paused timer can be resumed.')
  return getTimerById(db, id, now)
}

async function completeTimer(db, id, now = new Date()) {
  const timer = await getTimerById(db, id, now)
  if (!timer || !ACTIVE_TIMER_STATUSES.includes(timer.status)) {
    throw timerError('TIMER_NOT_ACTIVE', 'This timer is no longer active.')
  }
  if (timer.current_elapsed_seconds < 1) throw timerError('TIMER_TOO_SHORT', 'Study for at least one second before saving a session.', 400)
  const durationMinutes = Math.max(1, Math.round(timer.current_elapsed_seconds / 60))
  if (durationMinutes > MAX_SESSION_MINUTES) {
    throw timerError('TIMER_TOO_LONG', 'This timer exceeds the 24-hour session limit. Discard it and start a new session.', 400)
  }

  const endedAt = now.toISOString()
  await db.batch([
    {
      sql: `UPDATE study_timer_sessions
        SET status = 'COMPLETED', segment_started_at = NULL, ended_at = ?,
          elapsed_seconds = ?, duration_minutes = ?, updated_at = ?
        WHERE id = ? AND status IN ('RUNNING', 'PAUSED')`,
      args: [endedAt, timer.current_elapsed_seconds, durationMinutes, endedAt, id],
    },
    {
      sql: `INSERT INTO study_sessions
        (topic_id, started_at, ended_at, duration_minutes, session_date, timer_session_id)
        SELECT topic_id, started_at, ended_at, duration_minutes, session_date, id
        FROM study_timer_sessions
        WHERE id = ? AND status = 'COMPLETED' AND study_session_id IS NULL`,
      args: [id],
    },
    {
      sql: `UPDATE study_timer_sessions
        SET study_session_id = (SELECT id FROM study_sessions WHERE timer_session_id = ?)
        WHERE id = ? AND study_session_id IS NULL`,
      args: [id, id],
    },
  ])
  const completed = await getTimerById(db, id, now)
  if (completed.status !== 'COMPLETED' || !completed.study_session_id) {
    throw timerError('TIMER_COMPLETE_FAILED', 'The timer could not be saved as a study session.', 500)
  }
  return completed
}

async function discardTimer(db, id, now = new Date()) {
  const updated = await db.prepare(`
    UPDATE study_timer_sessions
    SET status = 'DISCARDED', segment_started_at = NULL, ended_at = ?, updated_at = ?
    WHERE id = ? AND status IN ('RUNNING', 'PAUSED')
  `).run(now.toISOString(), now.toISOString(), id)
  if (!updated.changes) throw timerError('TIMER_NOT_ACTIVE', 'Only an active timer can be discarded.')
  return getTimerById(db, id, now)
}

module.exports = {
  ACTIVE_TIMER_STATUSES,
  MAX_SESSION_MINUTES,
  elapsedSecondsFor,
  presentTimer,
  getActiveTimer,
  getTimerById,
  startTimer,
  pauseTimer,
  resumeTimer,
  completeTimer,
  discardTimer,
}
