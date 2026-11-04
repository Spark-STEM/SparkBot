CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  discord_role_id TEXT
);

ALTER TABLE chapters ADD COLUMN country_id INTEGER REFERENCES countries(id);

INSERT INTO countries (name, discord_role_id) VALUES
  ('United States', '1542710012726607882'),
  ('Ireland', '1542710036114178149'),
  ('Hong Kong', '1542710265403932783'),
  ('India', '1543520477157392446'),
  ('Italy', '1543777949914767423'),
  ('United Kingdom', '1543778003870294146');

UPDATE chapters
SET country_id = (
  SELECT countries.id
  FROM countries
  WHERE lower(trim(countries.name)) = lower(trim(chapters.country))
);

UPDATE chapters
SET discord_role_id = '1402057287014547516'
WHERE lower(trim(name)) = 'north creek';

UPDATE chapters
SET discord_role_id = '1340751235342401577'
WHERE lower(trim(name)) = 'bothell';

UPDATE chapters
SET discord_role_id = '1334030470215766016'
WHERE lower(trim(name)) = 'woodinville';

UPDATE chapters
SET discord_role_id = '1542710307091390545'
WHERE lower(trim(name)) = 'hudson county';

UPDATE chapters
SET discord_role_id = '1542710478655066174'
WHERE lower(trim(name)) = 'east brunswick';

UPDATE chapters
SET discord_role_id = '1542716129934311444'
WHERE lower(trim(name)) = 'orinda county' OR lower(trim(city)) = 'orinda';
