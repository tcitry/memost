CREATE TABLE IF NOT EXISTS eval_datasets (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  question_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_eval_datasets_slug
  ON eval_datasets (slug);

CREATE TABLE IF NOT EXISTS eval_items (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
  sample_id TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  question TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  category INTEGER,
  evidence TEXT NOT NULL DEFAULT '[]',
  sample_storage_key TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_items_dataset_sample_question
  ON eval_items (dataset_id, sample_id, question_index);

CREATE INDEX IF NOT EXISTS idx_eval_items_dataset
  ON eval_items (dataset_id, sample_id, question_index);

CREATE INDEX IF NOT EXISTS idx_eval_items_category
  ON eval_items (dataset_id, category);

CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL REFERENCES eval_datasets(id),
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  endpoint_model TEXT NOT NULL DEFAULT '',
  judge_url TEXT NOT NULL DEFAULT '',
  judge_model TEXT NOT NULL DEFAULT '',
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  average_score REAL,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_owner
  ON eval_runs (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eval_runs_dataset
  ON eval_runs (dataset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eval_runs_status
  ON eval_runs (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS eval_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES eval_items(id),
  status TEXT NOT NULL,
  candidate_answer TEXT NOT NULL DEFAULT '',
  judge_score REAL,
  judge_passed INTEGER,
  judge_reason TEXT NOT NULL DEFAULT '',
  error TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_results_run_item
  ON eval_results (run_id, item_id);

CREATE INDEX IF NOT EXISTS idx_eval_results_run
  ON eval_results (run_id, status);
