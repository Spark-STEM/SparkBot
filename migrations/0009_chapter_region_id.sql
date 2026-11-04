ALTER TABLE chapters ADD COLUMN region_id INTEGER REFERENCES regions(id);

UPDATE chapters
SET region_id = (
  SELECT regions.id
  FROM regions
  JOIN countries ON countries.id = regions.country_id
  WHERE lower(trim(countries.name)) = lower(trim(chapters.country))
    AND lower(trim(regions.name)) = lower(trim(chapters.region))
);
