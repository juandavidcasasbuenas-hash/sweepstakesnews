create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  creator_name text,
  admin_token_hash text,
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id),
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table submissions
  add column if not exists tournament_id uuid references tournaments(id);

create table if not exists results (
  id text primary key default 'world-cup-2026',
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table tournaments enable row level security;
alter table submissions enable row level security;
alter table results enable row level security;

drop policy if exists "Public can read tournaments" on tournaments;
create policy "Public can read tournaments"
  on tournaments for select
  using (true);

drop policy if exists "Public can create tournaments" on tournaments;
create policy "Public can create tournaments"
  on tournaments for insert
  with check (true);

drop policy if exists "Public can read submissions" on submissions;
create policy "Public can read submissions"
  on submissions for select
  using (true);

drop policy if exists "Public can create submissions" on submissions;
create policy "Public can create submissions"
  on submissions for insert
  with check (true);

drop policy if exists "Public can read results" on results;
create policy "Public can read results"
  on results for select
  using (true);

-- Keep writes to results on the service role used by API routes only.

insert into tournaments (slug, name)
values ('sweepstakes-news', 'Sweepstakes News')
on conflict (slug) do nothing;

update submissions
set tournament_id = (select id from tournaments where slug = 'sweepstakes-news')
where tournament_id is null;

create index if not exists submissions_tournament_id_idx
  on submissions(tournament_id);
