create extension if not exists "pgcrypto";

create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  source_kind text,
  source_ref text,
  source_code text,
  network text default 'mantle-mainnet',
  scan_depth text,
  protocols jsonb default '[]'::jsonb,
  status text,
  progress int default 0,
  current_stage text,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text
);

alter table scans add column if not exists protocols jsonb default '[]'::jsonb;

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references scans(id),
  contract_name text,
  risk_score int,
  severity_counts jsonb,
  scope jsonb,
  executive_summary text,
  report_hash text,
  created_at timestamptz
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id),
  severity text,
  category text,
  title text,
  file text,
  line_start int,
  line_end int,
  code_snippet text,
  summary text,
  why_mantle text,
  exploit_scenario text,
  recommended_fix text,
  patch_diff text,
  confidence numeric,
  gas_impact text,
  status text default 'open',
  sort_index int
);

create table if not exists proofs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id),
  report_hash text,
  tx_hash text,
  metadata_uri text,
  network text,
  logged_at timestamptz,
  verification_status text,
  erc8004_ref jsonb
);

create table if not exists ai_cache (
  cache_key text primary key,
  prompt_version text,
  response jsonb,
  created_at timestamptz
);
