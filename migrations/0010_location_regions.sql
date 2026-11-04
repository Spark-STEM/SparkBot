CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id INTEGER NOT NULL REFERENCES countries(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  UNIQUE(country_id, name),
  UNIQUE(country_id, code)
);

ALTER TABLE countries ADD COLUMN region_ids TEXT NOT NULL DEFAULT '[]';

INSERT OR IGNORE INTO regions (country_id, name, code)
SELECT id, 'Washington', 'WA'
FROM countries
WHERE lower(trim(name)) = 'united states';

INSERT OR IGNORE INTO regions (country_id, name, code)
SELECT id, 'New Jersey', 'NJ'
FROM countries
WHERE lower(trim(name)) = 'united states';

INSERT OR IGNORE INTO regions (country_id, name, code)
SELECT id, 'California', 'CA'
FROM countries
WHERE lower(trim(name)) = 'united states';

UPDATE countries
SET region_ids = (
  SELECT '[' || group_concat(regions.id, ',') || ']'
  FROM regions
  WHERE regions.country_id = countries.id
);
