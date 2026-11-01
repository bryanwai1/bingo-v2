-- DRAFT: to be reviewed and run by Jiamin. Not run by the developer.
-- Sets the illustrated tile icon (bingo_tasks.tile_icon) on the 25 "Grab Game Day"
-- cards, per staff/10-requirements/PRD-003-grab-board-icon-audit.md (icon list approved by Jiamin 2026-11-01). Only the board
-- with slug 'grab-game-day' is touched; same-titled cards elsewhere are left alone.
-- Safe to re-run: it just sets the same values again. If the board or any title
-- is not found (fewer than 25 distinct titles matched), it stops and changes nothing.
-- The board has 47 cards and some titles appear twice; every copy gets the same icon.
-- Note: icons only show on boards whose tile display is set to icons in the admin.

do $$
declare
  v_n integer;
begin
  with u as (
  update public.bingo_tasks t
     set tile_icon = m.icon
    from (values
      ('Memory & Spot the Difference', 'grab_video'),
      ('Claim the Zone', 'grab_pin'),
      ('Parcel Delivery Mission', 'grab_bag'),
      ('The Long Haul', 'grab_pin'),
      ('Order Stack Showdown', 'grab_food'),
      ('Ouch! Food Delivery', 'grab_food'),
      ('Quiz Solving', 'grab_phone'),
      ('Order Pickup Rush', 'grab_motorbike'),
      ('Icon Matching', 'grab_gamepad'),
      ('Perfect Pack Challenge', 'grab_bag'),
      ('Bubble Tea Order Match', 'grab_food'),
      ('Steady Hands Delivery', 'grab_food'),
      ('The Pick-up', 'grab_scooter'),
      ('Doorstep Drop-off', 'grab_hotel'),
      ('The Hand-over', 'grab_cash'),
      ('Pothole Road Run', 'grab_motorbike'),
      ('Ping Pong Pass', 'grab_gamepad'),
      ('Grab It All', 'grab_bag'),
      ('Crack the Passcode', 'grab_phone'),
      ('Red Light, Hold Tight!', 'grab_driver'),
      ('GrabCar to the Rescue!', 'grab_car'),
      ('GrabMart Order Picker', 'grab_bag'),
      ('Longest GRAAAB!', 'grab_trophy'),
      ('Where''s My Driver?', 'grab_driver'),
      ('Grab! Grab! GO!', 'grab_gamepad')
    ) as m(title, icon)
   where t.title = m.title
     and t.section_id = (select id from public.bingo_sections where slug = 'grab-game-day')
  returning t.title
  )
  select count(distinct title) into v_n from u;

  if v_n <> 25 then
    raise exception 'Expected 25 distinct Grab Game Day titles, matched %. Nothing changed.', v_n;
  end if;
end $$;
