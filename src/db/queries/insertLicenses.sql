INSERT INTO licenses (spdxId, name, nickname, url)
VALUES ($spdxId, $name, $nickname, $url) ON CONFLICT (spdxId) DO NOTHING;
