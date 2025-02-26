INSERT INTO owners (login, url, isOrganization)
VALUES ($login, $url, $isOrganization) ON CONFLICT (login) DO NOTHING;
