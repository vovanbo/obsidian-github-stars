SELECT COUNT(id) FILTER (
    WHERE unstarredAt IS NULL
  ) AS starredCount,
  COUNT(id) FILTER (
    WHERE unstarredAt IS NOT NULL
  ) AS unstarredCount,
  id AS lastRepoId,
  starredAt AS lastStarDate,
  importedAt AS lastImportDate
FROM repositories
ORDER BY starredAt DESC
LIMIT 1;
