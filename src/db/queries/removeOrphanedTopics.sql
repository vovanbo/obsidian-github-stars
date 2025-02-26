DELETE FROM topics
WHERE name NOT IN (
    SELECT DISTINCT topicPk
    FROM repositories_topics
  )
RETURNING name;
