-- Per-spot owner: an owner (by email) may manage only their own spot's events.
alter table spots add column if not exists owner_email text;
create index if not exists spots_owner_email_idx on spots (owner_email);
