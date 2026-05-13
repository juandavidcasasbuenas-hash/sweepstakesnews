create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists results (
  id text primary key default 'world-cup-2026',
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table submissions enable row level security;
alter table results enable row level security;

create policy "Public can read submissions"
  on submissions for select
  using (true);

create policy "Public can create submissions"
  on submissions for insert
  with check (true);

create policy "Public can read results"
  on results for select
  using (true);

-- Keep writes to results on the service role used by API routes only.
