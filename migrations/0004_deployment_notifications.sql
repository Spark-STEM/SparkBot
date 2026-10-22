CREATE TABLE deployment_notifications (
  event_key TEXT PRIMARY KEY,
  lease_owner TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  delivered_at INTEGER
);
