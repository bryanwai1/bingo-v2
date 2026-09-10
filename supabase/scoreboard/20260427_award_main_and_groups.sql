-- Award slides: support a "main" branded opener (HSBC-themed) and a
-- "consolation_group" prize kind that reveals 3 ranks per slide.
alter table bingo_award_configs
  add column if not exists consolation_group_count int not null default 0;

alter table bingo_award_configs
  add column if not exists holding_title text;

alter table bingo_award_configs
  add column if not exists main_title text;

alter table bingo_award_configs
  add column if not exists main_subtitle text;

alter table bingo_award_configs
  add column if not exists main_tagline text;
