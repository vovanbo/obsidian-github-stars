INSERT INTO repositories (
    id,
    name,
    description,
    url,
    homepageUrl,
    owner,
    isArchived,
    isFork,
    isPrivate,
    isTemplate,
    latestRelease,
    license,
    stargazerCount,
    forkCount,
    createdAt,
    pushedAt,
    starredAt,
    updatedAt,
    importedAt,
    languages,
    fundingLinks
  )
VALUES (
    $id,
    $name,
    $description,
    $url,
    $homepageUrl,
    $owner,
    $isArchived,
    $isFork,
    $isPrivate,
    $isTemplate,
    $latestRelease,
    $license,
    $stargazerCount,
    $forkCount,
    $createdAt,
    $pushedAt,
    $starredAt,
    $updatedAt,
    $importedAt,
    $languages,
    $fundingLinks
  ) ON CONFLICT (id) DO
UPDATE
SET description = excluded.description,
  homepageUrl = excluded.homepageUrl,
  isArchived = excluded.isArchived,
  isFork = excluded.isFork,
  isPrivate = excluded.isPrivate,
  isTemplate = excluded.isTemplate,
  latestRelease = excluded.latestRelease,
  license = excluded.license,
  stargazerCount = excluded.stargazerCount,
  forkCount = excluded.forkCount,
  createdAt = excluded.createdAt,
  pushedAt = excluded.pushedAt,
  starredAt = excluded.starredAt,
  updatedAt = excluded.updatedAt,
  unstarredAt = NULL,
  languages = excluded.languages,
  fundingLinks = excluded.fundingLinks;
