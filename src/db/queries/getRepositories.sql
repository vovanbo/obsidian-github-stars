SELECT r.*,
  l.name licenseName,
  l.nickname licenseNickname,
  l.url licenseUrl,
  o.login ownerLogin,
  o.url ownerUrl,
  o.isOrganization ownerIsOrganization
FROM repositories AS r
  LEFT JOIN licenses l ON l.spdxId = r.license
  JOIN owners o ON o.login = r.owner
ORDER BY r.starredAt DESC;
