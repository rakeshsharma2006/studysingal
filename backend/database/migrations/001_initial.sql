CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  semester TEXT NOT NULL CHECK (length(trim(semester)) BETWEEN 1 AND 50),
  exam_date TEXT CHECK (exam_date IS NULL OR (length(exam_date) = 10 AND date(exam_date) = exam_date)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (name, semester)
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  UNIQUE (subject_id, position)
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  estimated_minutes INTEGER NOT NULL DEFAULT 30 CHECK (estimated_minutes BETWEEN 1 AND 1440),
  completed_at TEXT CHECK (completed_at IS NULL OR (length(completed_at) = 10 AND date(completed_at) = completed_at))
);

CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  frequency TEXT NOT NULL DEFAULT 'DAILY' CHECK (frequency IN ('DAILY', 'WEEKDAYS', 'WEEKLY')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE RESTRICT,
  log_date TEXT NOT NULL CHECK (length(log_date) = 10 AND date(log_date) = log_date),
  completed INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0, 1)),
  UNIQUE (habit_id, log_date)
);

CREATE TABLE IF NOT EXISTS study_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  plan_date TEXT NOT NULL CHECK (length(plan_date) = 10 AND date(plan_date) = plan_date),
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 1440),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'COMPLETED', 'SKIPPED'))
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  session_date TEXT NOT NULL CHECK (length(session_date) = 10 AND date(session_date) = session_date),
  CHECK (julianday(ended_at) >= julianday(started_at))
);

CREATE TABLE IF NOT EXISTS topic_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  quiz_score REAL CHECK (quiz_score IS NULL OR quiz_score BETWEEN 0 AND 100),
  recall_score REAL CHECK (recall_score IS NULL OR recall_score BETWEEN 0 AND 100),
  confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS revision_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  due_date TEXT NOT NULL CHECK (length(due_date) = 10 AND date(due_date) = due_date),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED')),
  completed_at TEXT CHECK (completed_at IS NULL OR (length(completed_at) = 10 AND date(completed_at) = completed_at)),
  recall_score REAL CHECK (recall_score IS NULL OR recall_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_units_subject ON units(subject_id, position);
CREATE INDEX IF NOT EXISTS idx_topics_unit_status ON topics(unit_id, status);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, log_date);
CREATE INDEX IF NOT EXISTS idx_study_plans_date_status ON study_plans(plan_date, status);
CREATE INDEX IF NOT EXISTS idx_study_sessions_topic_date ON study_sessions(topic_id, session_date);
CREATE INDEX IF NOT EXISTS idx_assessments_topic_created ON topic_assessments(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_revision_tasks_due_status ON revision_tasks(due_date, status);
