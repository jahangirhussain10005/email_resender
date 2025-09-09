--------------  first run this sql query 

-- JOBS — normalized job snapshot from Xero
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_ref text not null,
  customer_name text not null,
  customer_email text,
  site_address text,
  subtotal numeric(12,2),
  gst numeric(12,2),
  total numeric(12,2),
  currency text default 'AUD',
  status text default 'new', -- new|pdf_rendered|emailed|completed
  source jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists jobs_job_ref_idx on public.jobs(job_ref);

-- PDF ARTIFACTS
create table if not exists public.pdf_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  version int not null default 1,
  storage_path text not null,
  content_sha256 text not null,
  created_at timestamptz default now()
);
create index if not exists pdf_artifacts_job_idx on public.pdf_artifacts(job_id);

-- EMAIL LOGS
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  to_email text not null,
  subject text not null,
  resend_id text,
  idempotency_key text unique,
  status text not null default 'queued',
  error text,
  payload jsonb,
  created_at timestamptz default now()
);
create index if not exists email_logs_job_idx on public.email_logs(job_id);

-- WARRANTY
create table if not exists public.warranty_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  customer_name text not null,
  customer_email text,
  site_address text,
  warranty_number text unique not null,
  status text not null default 'active',
  issued_at date not null default now(),
  metadata jsonb,
  created_at timestamptz default now()
);

-- TASKS QUEUE
create table if not exists public.tasks_queue (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  job_id uuid references public.jobs(id) on delete cascade,
  run_at timestamptz not null,
  attempts int not null default 0,
  max_attempts int not null default 5,
  payload jsonb,
  created_at timestamptz default now()
);



------------------the below sql query is for enabling RLS



alter table public.jobs enable row level security;
alter table public.pdf_artifacts enable row level security;
alter table public.email_logs enable row level security;
alter table public.warranty_records enable row level security;
alter table public.tasks_queue enable row level security;




--------------- and then run this the last one role based acces control 



-- JOBS
create policy "anon_no_access_jobs" on public.jobs for all using (false);
create policy "auth_read_jobs" on public.jobs for select using (auth.role() = 'authenticated');
create policy "service_full_jobs" on public.jobs
  for all using (auth.role() = 'service_role') with check (true);

-- PDF ARTIFACTS
create policy "auth_read_pdf" on public.pdf_artifacts for select using (auth.role() = 'authenticated');
create policy "service_full_pdf" on public.pdf_artifacts for all using (auth.role() = 'service_role') with check (true);

-- EMAIL LOGS
create policy "service_full_email" on public.email_logs for all using (auth.role() = 'service_role') with check (true);

-- WARRANTY
create policy "service_full_warranty" on public.warranty_records for all using (auth.role() = 'service_role') with check (true);

-- TASKS QUEUE
create policy "service_full_tasks" on public.tasks_queue for all using (auth.role() = 'service_role') with check (true);

--------- for storage defining roles 

-- For job-pdfs
create policy "Service role full access"
on storage.objects for all
using (auth.role() = 'service_role');

-- For warranty
create policy "Service role full access"
on storage.objects for all
using (auth.role() = 'service_role');

