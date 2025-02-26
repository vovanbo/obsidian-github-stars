DELETE FROM repositories
WHERE unstarredAt IS NOT NULL
RETURNING name,
  owner;
