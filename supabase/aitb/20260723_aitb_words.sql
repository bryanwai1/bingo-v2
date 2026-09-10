-- Word submissions: Nerf Prompt Cups (3 secret words) and Ping Pong Alphabet
-- Pitch (7 letter words) let teams type their words on the mission page;
-- they surface live in the admin panel.
alter table aitb_progress add column if not exists words text[] not null default '{}';

notify pgrst, 'reload schema';
