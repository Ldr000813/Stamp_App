-- Add content + event fields to spots. Run in Supabase SQL editor.
alter table spots add column if not exists type text not null default 'spot'; -- 'spot' | 'event'
alter table spots add column if not exists image_url text;
alter table spots add column if not exists address_ja text;
alter table spots add column if not exists address_en text;
alter table spots add column if not exists event_start timestamptz;
alter table spots add column if not exists event_end timestamptz;
