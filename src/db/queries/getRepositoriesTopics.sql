SELECT t.name,
  t.stargazerCount
FROM repositories_topics rt
  JOIN topics t ON t.name = rt.topicPk
WHERE rt.repoPk = $repoPk
ORDER BY t.stargazerCount DESC;
