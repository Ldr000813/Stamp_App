-- Resolved, universally-openable Google Maps place URL (shows the building profile,
-- keeps the place identity so it never drifts to the wrong coordinates).
alter table spots add column if not exists place_url text;
