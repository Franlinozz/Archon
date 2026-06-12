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
alter table scans add column if not exists source_bundle jsonb;

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references scans(id),
  contract_name text,
  risk_score int,
  severity_counts jsonb,
  scope jsonb,
  tests jsonb,
  executive_summary text,
  report_hash text,
  created_at timestamptz
);

alter table reports add column if not exists tests jsonb;

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references scans(id),
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
  sort_index int,
  dedupe_key text,
  created_at timestamptz default now()
);

alter table findings add column if not exists scan_id uuid references scans(id);
alter table findings add column if not exists dedupe_key text;
alter table findings add column if not exists created_at timestamptz default now();
drop index if exists findings_scan_dedupe_key;
create unique index if not exists findings_scan_dedupe_key on findings(scan_id, dedupe_key);

create table if not exists scan_logs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references scans(id),
  level text,
  message text,
  created_at timestamptz
);

create table if not exists proofs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id),
  report_hash text,
  tx_hash text,
  metadata_uri text,
  metadata jsonb,
  network text,
  logged_at timestamptz,
  created_at timestamptz default now(),
  verification_status text,
  erc8004_ref jsonb
);

alter table proofs add column if not exists metadata jsonb;
alter table proofs add column if not exists created_at timestamptz default now();
create unique index if not exists proofs_report_hash_key on proofs(report_hash);
create unique index if not exists proofs_report_id_key on proofs(report_id);

create table if not exists ai_cache (
  cache_key text primary key,
  prompt_version text,
  response jsonb,
  created_at timestamptz
);

create table if not exists gas_reports (
  id uuid primary key default gen_random_uuid(),
  source_kind text,
  source_ref text,
  source_code text,
  source_hash text,
  contract_name text,
  network text default 'mantle-mainnet',
  status text default 'queued',
  progress int default 0,
  current_stage text,
  pricing jsonb,
  measurement jsonb,
  totals jsonb,
  assumptions jsonb,
  report_hash text,
  proof_id uuid references proofs(id),
  anchor_tx_hash text,
  created_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text
);

create index if not exists gas_reports_status_created_idx on gas_reports(status, created_at desc);
alter table gas_reports add column if not exists source_bundle jsonb;
create index if not exists gas_reports_source_hash_idx on gas_reports(source_hash);

create table if not exists gas_optimizations (
  id uuid primary key default gen_random_uuid(),
  gas_report_id uuid references gas_reports(id) on delete cascade,
  rule_id text,
  title text,
  category text,
  file text,
  line_start int,
  location text,
  before text,
  after text,
  safety text,
  confidence numeric,
  status text,
  measurement_label text,
  est_l2_delta int,
  measured_l2_delta int,
  est_l1_delta_wei numeric,
  measured_l1_delta_wei numeric,
  annual_savings_usd numeric,
  rank_score numeric,
  patch jsonb,
  gas_diff jsonb,
  notes text,
  created_at timestamptz default now(),
  unique(gas_report_id, rule_id, location, before)
);

create index if not exists gas_optimizations_report_rank_idx on gas_optimizations(gas_report_id, rank_score desc nulls last);

create table if not exists report_challenges (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  gas_report_id uuid references gas_reports(id) on delete cascade,
  finding_id uuid references findings(id) on delete set null,
  optimization_id uuid references gas_optimizations(id) on delete set null,
  target_type text not null,
  challenger text,
  title text not null,
  rationale text not null,
  evidence_url text,
  status text not null default 'open',
  challenge_hash text not null unique,
  reference_tx_hash text,
  reference_report_hash text,
  created_at timestamptz default now()
);
create index if not exists report_challenges_report_idx on report_challenges(report_id, created_at desc);
create index if not exists report_challenges_gas_report_idx on report_challenges(gas_report_id, created_at desc);

-- Sentinel (F1): continuous audit of deployed Mantle contracts.
create table if not exists sentinel_watches (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  address text not null,
  label text,
  mode text default 'full',
  source_verified boolean default false,
  bytecode_hash text,
  impl_slot text,
  admin_slot text,
  owner_addr text,
  candidate_state jsonb,
  pending_scan_id uuid,
  last_report_id uuid references reports(id),
  last_checked_at timestamptz,
  last_drift_at timestamptz,
  consecutive_failures int default 0,
  status text default 'active',
  created_at timestamptz default now(),
  unique(owner, address)
);
create index if not exists sentinel_watches_active_idx on sentinel_watches(status, last_checked_at asc nulls first);

create table if not exists sentinel_events (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid references sentinel_watches(id) on delete cascade,
  type text not null,
  detail jsonb,
  scan_id uuid,
  report_id uuid,
  created_at timestamptz default now()
);
create index if not exists sentinel_events_watch_idx on sentinel_events(watch_id, created_at desc);

create table if not exists sentinel_settings (
  owner text primary key,
  webhook_url text,
  updated_at timestamptz default now()
);

-- Verified build attestations (F2): deployed bytecode vs claimed source.
create table if not exists attestations (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  chain_id int default 5000,
  source_ref text,
  contract_name text,
  compiler_version text,
  settings jsonb,
  source_hash text,
  status text default 'queued',
  match_type text,
  onchain_bytecode_hash text,
  compiled_bytecode_hash text,
  attestation_hash text,
  detail jsonb,
  source_bundle jsonb,
  error text,
  created_at timestamptz default now(),
  finished_at timestamptz
);
create index if not exists attestations_address_idx on attestations(address, created_at desc);
