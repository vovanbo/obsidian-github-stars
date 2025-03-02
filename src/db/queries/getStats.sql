SELECT COUNT(id) FILTER (
    WHERE unstarredAt IS NULL
  ) AS starredCount,
  COUNT(id) FILTER (
    WHERE unstarredAt IS NOT NULL
  ) AS unstarredCount,
  id AS lastRepoId
FROM repositories
ORDER BY starredAt DESC
LIMIT 1;
