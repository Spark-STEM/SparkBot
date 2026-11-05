CREATE TABLE persistent_components (
  custom_id TEXT PRIMARY KEY NOT NULL,
  owner_key TEXT NOT NULL,
  handler_key TEXT NOT NULL,
  params TEXT NOT NULL
);

CREATE INDEX persistent_components_owner_key
  ON persistent_components (owner_key);
