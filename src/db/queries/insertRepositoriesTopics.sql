INSERT INTO repositories_topics (repoPk, topicPk)
VALUES ($repoPk, $topicPk) ON CONFLICT (repoPk, topicPk) DO NOTHING;
