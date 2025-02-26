SELECT DISTINCT COALESCE(JSON_EXTRACT(r.languages, '$[0]'), 'Other') mainLanguage
FROM repositories r
ORDER BY mainLanguage;
