ALTER TABLE topic_assessments
ADD COLUMN confidence_rating INTEGER CHECK (confidence_rating IS NULL OR confidence_rating BETWEEN 1 AND 5);
