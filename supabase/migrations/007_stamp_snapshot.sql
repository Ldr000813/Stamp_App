-- Snapshot the spot's info onto each stamp, so acquisition history survives spot deletion.
alter table stamps add column if not exists spot_name_ja text;
alter table stamps add column if not exists spot_name_en text;
alter table stamps add column if not exists spot_image_url text;
