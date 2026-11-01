CREATE TABLE IF NOT EXISTS topic_completion_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  completed_at TEXT NOT NULL CHECK (length(completed_at) = 10 AND date(completed_at) = completed_at)
);

CREATE INDEX IF NOT EXISTS idx_topic_completion_history_topic_date
ON topic_completion_history(topic_id, completed_at);

INSERT INTO topic_completion_history (topic_id, completed_at)
SELECT id, COALESCE(completed_at, date('now', 'localtime'))
FROM topics
WHERE status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM topic_completion_history history WHERE history.topic_id = topics.id
  );

CREATE TRIGGER IF NOT EXISTS trg_topics_insert_completion_history
AFTER INSERT ON topics
WHEN NEW.status = 'COMPLETED'
BEGIN
  INSERT INTO topic_completion_history (topic_id, completed_at)
  VALUES (NEW.id, COALESCE(NEW.completed_at, date('now', 'localtime')));
END;

CREATE TRIGGER IF NOT EXISTS trg_topics_update_completion_history
AFTER UPDATE OF status ON topics
WHEN NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED'
BEGIN
  INSERT INTO topic_completion_history (topic_id, completed_at)
  VALUES (NEW.id, COALESCE(NEW.completed_at, date('now', 'localtime')));
END;
