DELETE FROM licenses
WHERE spdxId NOT IN (
    SELECT DISTINCT license
    FROM repositories
  )
RETURNING spdxId;
