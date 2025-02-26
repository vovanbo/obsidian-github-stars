INSERT INTO topics (name, stargazerCount)
VALUES ($name, $stargazerCount) ON CONFLICT (name) DO
UPDATE
SET stargazerCount = excluded.stargazerCount;
