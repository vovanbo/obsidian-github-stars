DELETE FROM owners
WHERE login NOT IN (
    SELECT DISTINCT owner
    FROM repositories
  )
RETURNING login;
