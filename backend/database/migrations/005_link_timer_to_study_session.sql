ALTER TABLE study_timer_sessions
ADD COLUMN study_session_id INTEGER REFERENCES study_sessions(id) ON DELETE SET NULL;
