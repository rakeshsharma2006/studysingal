CREATE TABLE IF NOT EXISTS study_timer_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'PAUSED', 'COMPLETED', 'DISCARDED')),
  started_at TEXT NOT NULL,
  segment_started_at TEXT,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  session_date TEXT NOT NULL CHECK (length(session_date) = 10 AND date(session_date) = session_date),
  ended_at TEXT,
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (status = 'RUNNING' AND segment_started_at IS NOT NULL AND ended_at IS NULL)
    OR (status = 'PAUSED' AND segment_started_at IS NULL AND ended_at IS NULL)
    OR (status IN ('COMPLETED', 'DISCARDED') AND segment_started_at IS NULL AND ended_at IS NOT NULL)
  )
);

ALTER TABLE study_sessions
ADD COLUMN timer_session_id INTEGER REFERENCES study_timer_sessions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_timer_single_active
ON study_timer_sessions(status)
WHERE status IN ('RUNNING', 'PAUSED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_sessions_timer_session
ON study_sessions(timer_session_id)
WHERE timer_session_id IS NOT NULL;
