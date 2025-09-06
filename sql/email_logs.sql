create extension if not exists pgcrypto;
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  quote_id text,
  to_email text not null,
  subject text not null,
  status text not null,
  resend_id text,
  idempotency_key text unique,
  payload jsonb,
  created_at timestamptz default now()
);
create index if not exists email_logs_created_at_idx on public.email_logs (created_at desc);
