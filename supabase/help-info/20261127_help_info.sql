-- Emergency contacts + pinned message shown in the help chat. Safe to re-run.
--
--  bingo_sections.help_info (jsonb, null = nothing shown). Shape (src/lib/helpInfo.ts):
--    { show: true,
--      contacts: [{ label, name, phone, whatsapp }],   -- up to 3
--      pin: 'text', pinAt: '<iso>' }                   -- pinAt lets the chat flag a new pin
-- Players already read their board's section row, so no policy change is needed.

alter table public.bingo_sections add column if not exists help_info jsonb;
