-- Campus Quests: demo seed (Person B)
-- Run after schema.sql. Re-running it resets the demo to its starting state
-- (do that before each rehearsal).
--
-- PLACEHOLDERS to swap when teammates deliver:
--   * Report titles/locations  -> Person E's 25 titles (section 3)
--   * Obstacle footprints, detours and the walk path -> Person A's geojson.io export (section 4)
--   Coordinates below are hand-placed approximations around SJSU.

set search_path = public, extensions;

truncate users, rewards, demo_paths restart identity cascade;

-- lat/lng -> geography point
create or replace function pg_temp.pt(lat float8, lng float8) returns geography
language sql as $$ select st_setsrid(st_makepoint(lng, lat), 4326)::geography $$;

-- ---------------------------------------------------------------------------
-- 1. Users: the four demo users plus two background students who filed reports
-- ---------------------------------------------------------------------------
insert into users (id, sjsu_email, display_name, role) values
  ('a0000000-0000-4000-8000-000000000001', 'maya@sjsu.edu',         'Maya',              'student'),
  ('a0000000-0000-4000-8000-000000000002', 'leo@sjsu.edu',          'Leo',               'student'),
  ('a0000000-0000-4000-8000-000000000003', 'lostandfound@sjsu.edu', 'Lost & Found desk', 'office'),
  ('a0000000-0000-4000-8000-000000000004', 'moderator@sjsu.edu',    'Moderator',         'moderator'),
  ('a0000000-0000-4000-8000-000000000005', 'jordan@sjsu.edu',       'Jordan',            'student'),
  ('a0000000-0000-4000-8000-000000000006', 'ava@sjsu.edu',          'Ava',               'student');

-- ---------------------------------------------------------------------------
-- 2. Rewards catalog
-- ---------------------------------------------------------------------------
insert into rewards (id, name, cost_points, partner, stock) values
  ('e0000000-0000-4000-8000-000000000001', '$5 campus meal credit',  100, 'Campus dining (mock)', null),
  ('e0000000-0000-4000-8000-000000000002', '$10 campus meal credit', 200, 'Campus dining (mock)', null);

-- ---------------------------------------------------------------------------
-- 3. Reports (25) around SJSU
--    Jordan = ...05, Ava = ...06, Maya = ...01
-- ---------------------------------------------------------------------------
insert into reports (
  id, reporter_id, kind, category, issue_type, severity, title, location, building, floor,
  fix_path, hazard_flags, access_impact, routed_to, status, created_at
) values
  -- Water
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'issue', 'water', 'bottle_filler', 1,
   'Bottle filler red light, Student Union 2nd floor', pg_temp.pt(37.33632, -121.88098), 'Student Union', '2',
   'self_fixable', '{}', '{}', 'Facilities', 'mission_open', now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000006', 'issue', 'water', 'bottle_filler', 1,
   'Bottle filler not dispensing, Engineering 1st floor', pg_temp.pt(37.33718, -121.88182), 'Engineering', '1',
   'self_fixable', '{}', '{}', 'Facilities', 'mission_open', now() - interval '1 day'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005', 'issue', 'water', 'fountain_leak', 2,
   'Leaking drinking fountain, Sweeney Hall lobby', pg_temp.pt(37.33452, -121.88378), 'Sweeney Hall', '1',
   'staff', '{}', '{}', 'Facilities', 'routed', now() - interval '3 days'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000006', 'issue', 'water', 'bottle_filler', 1,
   'Bottle filler slow, Spartan Recreation Center lobby', pg_temp.pt(37.33425, -121.88002), 'SRAC', '1',
   'self_fixable', '{}', '{}', 'Facilities', 'mission_open', now() - interval '6 hours'),

  -- Connectivity
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000006', 'issue', 'connectivity', 'slow_wifi', 2,
   'Slow Wi-Fi, MLK Library 4th floor study rooms', pg_temp.pt(37.33558, -121.88495), 'MLK Library', '4',
   'self_fixable', '{}', '{}', 'IT Services', 'mission_open', now() - interval '5 hours'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000005', 'issue', 'connectivity', 'wifi_drops', 2,
   'eduroam keeps dropping, Clark Hall 2nd floor', pg_temp.pt(37.33582, -121.88228), 'Clark Hall', '2',
   'self_fixable', '{}', '{}', 'IT Services', 'mission_open', now() - interval '20 hours'),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000006', 'issue', 'connectivity', 'no_wifi', 3,
   'No Wi-Fi signal, Duncan Hall 3rd floor labs', pg_temp.pt(37.33262, -121.88195), 'Duncan Hall', '3',
   'staff', '{}', '{}', 'IT Services', 'routed', now() - interval '2 days'),

  -- Waste
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000005', 'issue', 'waste', 'overflowing_bin', 2,
   'Overflowing trash bin, 7th Street Plaza', pg_temp.pt(37.33520, -121.88112), null, null,
   'staff', '{}', '{}', 'Grounds', 'routed', now() - interval '3 hours'),
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000006', 'issue', 'waste', 'litter', 1,
   'Litter around the benches, Tower Lawn', pg_temp.pt(37.33505, -121.88300), null, null,
   'self_fixable', '{}', '{}', 'Grounds', 'mission_open', now() - interval '4 hours'),
  ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000005', 'issue', 'waste', 'chairs', 1,
   'Chairs piled up in study room, Student Union 3rd floor', pg_temp.pt(37.33622, -121.88112), 'Student Union', '3',
   'self_fixable', '{}', '{}', 'Student Union', 'mission_open', now() - interval '8 hours'),
  ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000006', 'issue', 'waste', 'overflowing_bin', 2,
   'Recycling bins overflowing, Dining Commons patio', pg_temp.pt(37.33415, -121.87818), 'Dining Commons', null,
   'staff', '{}', '{}', 'Grounds', 'routed', now() - interval '1 day'),

  -- Paths and roads (12, 13 are demo obstacles)
  ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000005', 'issue', 'paths', 'construction', 4,
   'Construction zone, Clark Hall north entrance', pg_temp.pt(37.33624, -121.88240), 'Clark Hall', null,
   'staff', '{construction}', '{wheelchair,crutches,low_vision,no_stairs}', 'Facilities', 'routed', now() - interval '4 days'),
  ('b0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000006', 'issue', 'paths', 'pothole', 3,
   'Pothole on the walkway by Duncan Hall', pg_temp.pt(37.33290, -121.88160), null, null,
   'staff', '{}', '{wheelchair,crutches,low_vision}', 'Grounds', 'routed', now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000005', 'issue', 'paths', 'cracked_sidewalk', 2,
   'Cracked sidewalk, Paseo de San Carlos by the Event Center', pg_temp.pt(37.33470, -121.87990), null, null,
   'staff', '{}', '{wheelchair}', 'Grounds', 'routed', now() - interval '5 days'),
  ('b0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000006', 'issue', 'paths', 'flooding', 2,
   'Walkway flooded after sprinklers, Tower Lawn path', pg_temp.pt(37.33530, -121.88350), null, null,
   'staff', '{}', '{wheelchair,crutches}', 'Grounds', 'routed', now() - interval '7 hours'),

  -- Accessibility (16, 17 are demo obstacles)
  ('b0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000005', 'issue', 'accessibility', 'blocked_ramp', 4,
   'Ramp blocked by parked scooters, Engineering east entrance', pg_temp.pt(37.33729, -121.88145), 'Engineering', '1',
   'staff', '{}', '{wheelchair,crutches}', 'Facilities', 'routed', now() - interval '9 hours'),
  ('b0000000-0000-4000-8000-000000000017', 'a0000000-0000-4000-8000-000000000006', 'issue', 'accessibility', 'elevator_out', 5,
   'Elevator out, MLK Library floors 2–5', pg_temp.pt(37.33550, -121.88510), 'MLK Library', '2-5',
   'staff', '{}', '{wheelchair,crutches,no_stairs}', 'Facilities', 'routed', now() - interval '1 day'),
  ('b0000000-0000-4000-8000-000000000018', 'a0000000-0000-4000-8000-000000000005', 'issue', 'accessibility', 'door_button', 3,
   'Door button broken, Hugh Gillis Hall main entrance', pg_temp.pt(37.33568, -121.88432), 'Hugh Gillis Hall', '1',
   'staff', '{}', '{wheelchair}', 'Facilities', 'routed', now() - interval '3 days'),
  ('b0000000-0000-4000-8000-000000000019', 'a0000000-0000-4000-8000-000000000006', 'issue', 'accessibility', 'door_stuck', 2,
   'Automatic door stuck closed, Business Tower', pg_temp.pt(37.33670, -121.87905), 'Business Tower', '1',
   'staff', '{}', '{wheelchair}', 'Facilities', 'routed', now() - interval '10 hours'),

  -- Pests (never missions)
  ('b0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000005', 'issue', 'pests', 'rats', 3,
   'Rats near the dumpsters behind Dining Commons', pg_temp.pt(37.33398, -121.87790), 'Dining Commons', null,
   'staff', '{pests}', '{}', 'Facilities', 'routed', now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000006', 'issue', 'pests', 'ants', 2,
   'Ants in the Clark Hall 1st floor lounge', pg_temp.pt(37.33575, -121.88215), 'Clark Hall', '1',
   'staff', '{pests}', '{}', 'Facilities', 'routed', now() - interval '1 day'),

  -- Hazard: never a mission even though it looks simple
  ('b0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000005', 'issue', 'connectivity', 'charging_station', 3,
   'Charging station sparking, Student Union food court', pg_temp.pt(37.33640, -121.88125), 'Student Union', '1',
   'staff', '{electrical}', '{}', 'Facilities', 'routed', now() - interval '2 hours'),

  -- Lost & Found
  ('b0000000-0000-4000-8000-000000000023', 'a0000000-0000-4000-8000-000000000001', 'lost', 'lost_found', 'earbuds_case', 1,
   'Black AirPods case', pg_temp.pt(37.33552, -121.88505), 'MLK Library', '3',
   'lost_found', '{}', '{}', 'Lost & Found', 'searching', now() - interval '3 hours'),
  ('b0000000-0000-4000-8000-000000000024', 'a0000000-0000-4000-8000-000000000006', 'lost', 'lost_found', 'water_bottle', 1,
   'Blue Hydro Flask water bottle', pg_temp.pt(37.33430, -121.88010), 'SRAC', null,
   'lost_found', '{}', '{}', 'Lost & Found', 'searching', now() - interval '1 day'),
  ('b0000000-0000-4000-8000-000000000025', 'a0000000-0000-4000-8000-000000000005', 'found', 'lost_found', 'clothing', 1,
   'Gray Spartans hoodie', pg_temp.pt(37.33628, -121.88085), 'Student Union', '1',
   'lost_found', '{}', '{}', 'Lost & Found', 'checked_in', now() - interval '2 days');

update reports set description = 'Use the east ramp; adds about 4 min.' where id = 'b0000000-0000-4000-8000-000000000012';
update reports set description = 'Small inside pocket sticker of a cactus.' where id = 'b0000000-0000-4000-8000-000000000023';

-- Status history: submitted, then the current status
insert into status_events (report_id, from_status, to_status, actor_id, at)
select id, null, 'submitted', reporter_id, created_at from reports;
insert into status_events (report_id, from_status, to_status, actor_id, at)
select id, 'submitted', status, null, created_at + interval '2 minutes' from reports where status <> 'submitted';

-- Lost & found item details
insert into items (report_id, category, color, brand, marks, radius_m, area, lost_from, lost_to, whereabouts, checkin_code, office_checkin_at) values
  ('b0000000-0000-4000-8000-000000000023', 'earbuds_case', 'black', 'Apple', 'cactus sticker inside the lid', 50,
   st_buffer(pg_temp.pt(37.33552, -121.88505), 50)::geography,
   date_trunc('day', now()) + interval '14 hours', date_trunc('day', now()) + interval '16 hours', null, null, null),
  ('b0000000-0000-4000-8000-000000000024', 'water_bottle', 'blue', 'Hydro Flask', 'dent near the bottom', 80,
   st_buffer(pg_temp.pt(37.33430, -121.88010), 80)::geography,
   now() - interval '26 hours', now() - interval '24 hours', null, null, null),
  ('b0000000-0000-4000-8000-000000000025', 'clothing', 'gray', 'SJSU Spartans', 'size M', 10,
   st_buffer(pg_temp.pt(37.33628, -121.88085), 10)::geography,
   null, null, 'at_office', '482913', now() - interval '47 hours');

-- "Me too" votes
insert into report_votes (report_id, user_id) values
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005'),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000006'),
  ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000006'),
  ('b0000000-0000-4000-8000-000000000017', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000017', 'a0000000-0000-4000-8000-000000000005'),
  ('b0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- 4. Obstacles, detours and the Simulate-walk path (swap in Person A's GeoJSON)
-- ---------------------------------------------------------------------------
update reports set footprint = st_geogfromtext('SRID=4326;POLYGON((
  -121.88255 37.33618, -121.88225 37.33618, -121.88225 37.33630, -121.88255 37.33630, -121.88255 37.33618))')
where id = 'b0000000-0000-4000-8000-000000000012';

update reports set footprint = st_buffer(pg_temp.pt(37.33290, -121.88160), 1.5)::geography
where id = 'b0000000-0000-4000-8000-000000000013';

update reports set footprint = st_buffer(
  st_geogfromtext('SRID=4326;LINESTRING(-121.88145 37.33725, -121.88145 37.33733)'), 0.6)::geography
where id = 'b0000000-0000-4000-8000-000000000016';

insert into access_alerts (report_id, affects, obstacle_style, impact, label, detour_text, detour_path, est_delay_min, confirmed) values
  ('b0000000-0000-4000-8000-000000000012', '{wheelchair,crutches,low_vision,no_stairs}', 'zone', 'blocks',
   'Construction · Clark Hall north entrance',
   'Construction ahead at the Clark Hall north entrance. Use the east ramp; adds about 4 min.',
   st_geogfromtext('SRID=4326;LINESTRING(-121.88200 37.33595, -121.88190 37.33610, -121.88195 37.33640, -121.88240 37.33645)'),
   4, true),
  ('b0000000-0000-4000-8000-000000000013', '{wheelchair,crutches,low_vision}', 'pothole', 'caution',
   'Pothole · Duncan Hall walkway',
   'Pothole ahead on the Duncan Hall walkway. Keep to the left side of the path.',
   st_geogfromtext('SRID=4326;LINESTRING(-121.88160 37.33280, -121.88148 37.33290, -121.88160 37.33300)'),
   1, true),
  ('b0000000-0000-4000-8000-000000000016', '{wheelchair,crutches}', 'barrier', 'blocks',
   'Ramp blocked · Engineering east entrance',
   'The Engineering east ramp is blocked. Use the north entrance on San Fernando St; adds about 3 min.',
   st_geogfromtext('SRID=4326;LINESTRING(-121.88140 37.33720, -121.88130 37.33745, -121.88170 37.33752)'),
   3, true),
  ('b0000000-0000-4000-8000-000000000017', '{wheelchair,crutches,no_stairs}', 'elevator', 'blocks',
   'Elevator out, floors 2–5',
   'MLK Library elevator is out for floors 2–5. Use the elevators by the 4th St entrance; adds about 2 min.',
   null, 2, true);

-- Starts ~200 m south-east of the construction zone so the 150 m alert fires mid-walk.
insert into demo_paths (name, path) values
  ('clark_walk', st_geogfromtext('SRID=4326;LINESTRING(
    -121.88080 37.33470, -121.88130 37.33540, -121.88200 37.33590, -121.88238 37.33612)'));

-- ---------------------------------------------------------------------------
-- 5. Missions for the self-fixable reports and the open lost reports
-- ---------------------------------------------------------------------------
insert into missions (id, report_id, mission_type, title, points, proof_required, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'verify',
   'Verify: Bottle filler red light, Student Union 2nd floor', 5, 'Geotagged photo at the pin', now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'verify',
   'Verify: Bottle filler not dispensing, Engineering 1st floor', 5, 'Geotagged photo at the pin', now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', 'verify',
   'Verify: Bottle filler slow, Spartan Recreation Center lobby', 5, 'Geotagged photo at the pin', now() - interval '6 hours'),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000005', 'verify',
   'Is the Wi-Fi still slow on MLK floor 4?', 5, 'Speed test at the pin', now() - interval '5 hours'),
  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000006', 'verify',
   'Is eduroam still dropping in Clark Hall?', 5, 'Speed test at the pin', now() - interval '20 hours'),
  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000009', 'tidy',
   'Quick tidy: litter around the Tower Lawn benches', 10, 'Before and after photos', now() - interval '4 hours'),
  ('c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000010', 'tidy',
   'Quick tidy: return the chairs in the Student Union study room', 10, 'Before and after photos', now() - interval '8 hours'),
  ('c0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000023', 'search',
   'Keep an eye out for a black AirPods case, MLK Library floor 3', 50,
   'A matching found report checked in at Lost & Found', now() - interval '3 hours'),
  ('c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000024', 'search',
   'Keep an eye out for a blue Hydro Flask near the SRAC', 50,
   'A matching found report checked in at Lost & Found', now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- 6. Points history
--    Leo: 60 spendable, so one +50 return takes him past the 100-point $5 voucher.
-- ---------------------------------------------------------------------------
insert into points_ledger (user_id, delta, reason, report_id, state, created_at) values
  ('a0000000-0000-4000-8000-000000000002', 50, 'return_checkin', null, 'spendable', now() - interval '6 days'),
  ('a0000000-0000-4000-8000-000000000002', 10, 'mission:access_check', null, 'spendable', now() - interval '4 days'),
  ('a0000000-0000-4000-8000-000000000001', 10, 'mission:tidy', null, 'spendable', now() - interval '5 days'),
  ('a0000000-0000-4000-8000-000000000001', 5, 'mission:verify', null, 'spendable', now() - interval '3 days'),
  ('a0000000-0000-4000-8000-000000000005', 50, 'return_checkin', 'b0000000-0000-4000-8000-000000000025', 'spendable', now() - interval '47 hours');

-- A welcome notification so the inbox isn't empty
insert into notifications (user_id, text, link, created_at) values
  ('a0000000-0000-4000-8000-000000000001', 'Search mission posted for your black AirPods case. Helpers near MLK Library can see it.', '/?report=b0000000-0000-4000-8000-000000000023', now() - interval '2 hours'),
  ('a0000000-0000-4000-8000-000000000002', '+10 points approved: accessibility check at Engineering.', '/missions', now() - interval '4 days');
