-- Whether a slot's draw feeds the card's prompt.
--
-- Some draws chain into a sentence a team pastes into an AI tool ("A ninja
-- penguin / breakdancing / on the moon"); others are just a set of things to go
-- and find, where repeating them as a "prompt" says the same thing twice. That
-- was being guessed from the shape of the slots — now the admin says which.
--
-- Defaults to off, so a card only builds a prompt when someone asks for one.

alter table bingo_draw_slots
  add column if not exists in_prompt boolean not null default false;

-- The Nerf cups are the draw that was always a prompt: three words that read as
-- one instruction. Turn those on so they keep their prompt strip.
update bingo_draw_slots
set in_prompt = true
where pool_key in ('cupCharacter', 'cupAction', 'cupScene');
