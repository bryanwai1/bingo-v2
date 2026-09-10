-- Migration: add answer-input card type to bingo_tasks
-- Run this in the Supabase SQL editor or via `supabase db push`.

alter table bingo_tasks
  add column if not exists task_type  text not null default 'standard'
                                      check (task_type in ('standard', 'answer')),
  add column if not exists answer_question  text,
  add column if not exists answer_text      text;

comment on column bingo_tasks.task_type is
  '''standard'' = marshal-verified completion; ''answer'' = auto-complete on correct typed answer';
comment on column bingo_tasks.answer_question is
  'Prompt shown to participants above the letter-box rows (answer cards only)';
comment on column bingo_tasks.answer_text is
  'Newline-separated correct answers; each line becomes one row of letter boxes (answer cards only)';
