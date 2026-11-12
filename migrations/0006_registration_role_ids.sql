-- Keep only the registration roles and associate each one with its Discord role.
UPDATE roles
SET name = 'PR Manager', discord_role_id = '1556846277663137793'
WHERE id = 3 OR lower(trim(name)) = 'pr manager';

UPDATE roles
SET name = 'Chapter lead', discord_role_id = '1542710878888001576'
WHERE id = 4 OR lower(trim(name)) = 'chapter lead';

UPDATE roles
SET name = 'Chapter PR', discord_role_id = '1542710941924335696'
WHERE id = 5 OR lower(trim(name)) = 'chapter pr';

UPDATE roles
SET name = 'Tech team', discord_role_id = '1546728101772529674'
WHERE id = 7 OR lower(trim(name)) = 'tech team';

UPDATE roles
SET name = 'Online curriculum', discord_role_id = '1543487382299476038'
WHERE id = 8 OR lower(trim(name)) = 'online curriculum';

UPDATE roles
SET name = 'SCcript writer', discord_role_id = '1556173893075468348'
WHERE id = 9 OR lower(trim(name)) = 'script writer';

UPDATE roles
SET name = 'Voice over', discord_role_id = '1556174125926449202'
WHERE id = 10 OR lower(trim(name)) = 'voiceover';

UPDATE roles
SET name = 'Editor', discord_role_id = '1543764040386478151'
WHERE id = 11 OR lower(trim(name)) = 'editor';

UPDATE roles
SET name = 'Volunteer', discord_role_id = '1546730257032155137'
WHERE id = 6 OR lower(trim(name)) = 'volunteer';

DELETE FROM member_roles
WHERE role_id NOT IN (
  SELECT id FROM roles
  WHERE discord_role_id IN (
    '1556846277663137793',
    '1542710878888001576',
    '1542710941924335696',
    '1546728101772529674',
    '1543487382299476038',
    '1556173893075468348',
    '1556174125926449202',
    '1543764040386478151',
    '1546730257032155137'
  )
);

DELETE FROM roles
WHERE discord_role_id IS NULL
   OR discord_role_id NOT IN (
    '1556846277663137793',
    '1542710878888001576',
    '1542710941924335696',
    '1546728101772529674',
    '1543487382299476038',
    '1556173893075468348',
    '1556174125926449202',
    '1543764040386478151',
    '1546730257032155137'
  );
