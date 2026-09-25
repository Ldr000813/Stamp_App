-- Public bucket for uploaded images. Run in Supabase SQL editor.
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;
