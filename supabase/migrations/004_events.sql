-- Events are dated occurrences hosted at a spot (venue). Run in Supabase SQL editor.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid references spots(id) on delete set null,
  title_ja text not null,
  title_en text not null,
  description_ja text,
  description_en text,
  image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table events enable row level security;
create policy "public read events" on events for select using (true);
create index if not exists events_starts_at_idx on events (starts_at);
