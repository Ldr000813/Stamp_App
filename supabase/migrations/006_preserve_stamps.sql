-- Collected stamps must NEVER be deleted as a side effect of deleting a spot/campaign.
-- Change cascades to SET NULL so the stamp row is always preserved (only the reference clears).
alter table stamps alter column spot_id drop not null;
alter table stamps alter column campaign_id drop not null;

alter table stamps drop constraint if exists stamps_spot_id_fkey;
alter table stamps add constraint stamps_spot_id_fkey
  foreign key (spot_id) references spots(id) on delete set null;

alter table stamps drop constraint if exists stamps_campaign_id_fkey;
alter table stamps add constraint stamps_campaign_id_fkey
  foreign key (campaign_id) references campaigns(id) on delete set null;
