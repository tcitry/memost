-- eval_run_secrets: short-lived envelope for LLM credentials passed to
-- the queue consumer. Replaces storing endpoint/judge api keys inside
-- queue message bodies (which are visible in dashboards and DLQs).
--
-- Rows are written when a run is created and deleted when the run
-- terminates (or after expires_at). The payload is encrypted with
-- AES-GCM when EVAL_SECRETS_KEY is configured; otherwise stored as
-- plaintext JSON with a warning logged.
CREATE TABLE IF NOT EXISTS eval_run_secrets (
  run_id TEXT PRIMARY KEY REFERENCES eval_runs(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_eval_run_secrets_expires
  ON eval_run_secrets (expires_at);
