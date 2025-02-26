CREATE TABLE IF NOT EXISTS licenses (
    spdxId TEXT PRIMARY KEY UNIQUE NOT NULL,
    name TEXT NULL,
    nickname TEXT NULL,
    url TEXT NULL
);
CREATE TABLE IF NOT EXISTS owners (
    login TEXT PRIMARY KEY UNIQUE NOT NULL,
    url TEXT NOT NULL,
    isOrganization boolean DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS topics (
    name TEXT PRIMARY KEY UNIQUE NOT NULL,
    stargazerCount INTEGER
);
CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NULL,
    url TEXT NOT NULL,
    homepageUrl TEXT NULL,
    owner REFERENCES owners (login) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
    isArchived boolean NOT NULL,
    isFork boolean NOT NULL,
    isPrivate boolean NOT NULL,
    isTemplate boolean NOT NULL,
    latestRelease TEXT NULL,
    license REFERENCES licenses (spdxId) ON DELETE SET NULL ON UPDATE CASCADE NULL,
    stargazerCount INTEGER NOT NULL,
    forkCount INTEGER NOT NULL,
    createdAt datetime NOT NULL,
    pushedAt datetime NOT NULL,
    starredAt datetime NOT NULL,
    updatedAt datetime NOT NULL,
    importedAt datetime NOT NULL,
    unstarredAt datetime NULL,
    languages TEXT NULL,
    fundingLinks TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx__repositoriesNames ON repositories (name);
CREATE INDEX IF NOT EXISTS idx__repositoriesOwners ON repositories (owner);
CREATE INDEX IF NOT EXISTS idx__repositoriesLicenses ON repositories (license);
CREATE INDEX IF NOT EXISTS idx__repositoriesStarredAt ON repositories (starredAt);
CREATE INDEX IF NOT EXISTS idx__repositoriesImportedAt ON repositories (importedAt);
CREATE TABLE IF NOT EXISTS repositories_topics (
    repoPk REFERENCES repositories (id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
    topicPk REFERENCES topics (name) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uidx__repositories_topics ON repositories_topics (repoPk, topicPk);
