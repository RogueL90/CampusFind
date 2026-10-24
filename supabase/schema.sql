-- CampusFind: Supabase schema (Person B)
-- Run once in the Supabase SQL editor, then run seed.sql.
-- Safe to re-run: it drops and recreates everything in the public schema it owns.
--
-- DEMO ONLY: row-level security is enabled but every table has a permissive
-- "demo_all" policy, and the RPC functions trust the user id the client sends.
-- Real build: SJSU email sign-in, policies keyed on auth.uid(), functions read auth.uid().

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Clean slate
-- ---------------------------------------------------------------------------
drop view if exists reports_geo, access_alerts_geo, demo_paths_geo, balances, proofs_review, volunteer_summary cascade;
drop table if exists
  volunteer_registrations, fix_path_overrides, notifications, access_profiles, access_alerts, demo_paths,
  status_events, redemptions, rewards, points_ledger, mission_proofs, missions,
  matches, items, report_checks, report_votes, reports, users cascade;
drop type if exists fix_path cascade;

-- ---------------------------------------------------------------------------
-- Tables (MASTER.md data model)
-- ---------------------------------------------------------------------------
create type fix_path as enum ('staff', 'self_fixable', 'lost_found');

create table users (
  id           uuid primary key default gen_random_uuid(),
  sjsu_email   text unique not null,
  display_name text not null,
  role         text not null default 'student' check (role in ('student', 'office', 'moderator')),
  banned_at    timestamptz,
  created_at   timestamptz not null default now()
);

create table reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter_id        uuid references users(id),
  kind               text not null check (kind in ('issue', 'lost', 'found')),
  category           text not null,      -- connectivity, water, waste, paths, accessibility, pests, lost_found
  issue_type         text,
  severity           smallint check (severity between 1 and 5),
  title              text not null,
  description        text,
  photo_urls         text[] not null default '{}',
  location           geography(Point, 4326) not null,
  footprint          geography(Polygon, 4326),  -- area for construction zones and other obstacles
  building           text,
  floor              text,
  fix_path           fix_path not null,
  hazard_flags       text[] not null default '{}',
  access_impact      text[] not null default '{}',
  routed_to          text,               -- authority id from lib/categories.ts
  cc                 text[] not null default '{}',  -- other authorities copied on the report
  identified         text,               -- what the AI saw in the photo
  routing_reason     text,
  report_subject     text,               -- the written report sent to the authority
  report_body        text,
  contains_sensitive boolean not null default false,
  public_map         boolean not null default true,  -- lost/found: false stays off other students' maps
  solvable_reason    text,               -- the AI's reason it is (or isn't) student solvable
  status             text not null default 'submitted',
  created_at         timestamptz not null default now()
);
create index reports_location_idx on reports using gist (location);
create index reports_kind_idx on reports (kind, status);

create table report_votes (
  report_id  uuid references reports(id) on delete cascade,
  user_id    uuid references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

-- "Still there" / "Looks resolved" from students walking past (check_report).
create table report_checks (
  id          bigserial primary key,
  report_id   uuid not null references reports(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  still_there boolean not null,
  at          timestamptz not null default now()
);
create index report_checks_report_idx on report_checks (report_id, at desc);

create table items (
  report_id        uuid primary key references reports(id) on delete cascade,
  category         text,               -- e.g. earbuds_case, water_bottle
  color            text,
  brand            text,
  marks            text,
  image_embedding  real[],             -- reserved; matching uses the vision model for the demo
  radius_m         int not null default 50,
  area             geography(Polygon, 4326),  -- approximate circle
  lost_from        timestamptz,
  lost_to          timestamptz,
  whereabouts      text check (whereabouts in ('with_finder', 'at_office', 'picked_up')),
  checkin_code     text unique,        -- 6-digit code / QR payload for found items
  office_checkin_at timestamptz,
  picked_up_at     timestamptz
);

create table matches (
  id              uuid primary key default gen_random_uuid(),
  lost_report_id  uuid not null references reports(id) on delete cascade,
  found_report_id uuid not null references reports(id) on delete cascade,
  score           numeric(4, 3) not null,
  status          text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  created_at      timestamptz not null default now(),
  unique (lost_report_id, found_report_id)
);

create table missions (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references reports(id) on delete cascade,
  mission_type     text not null check (mission_type in ('return', 'delivery', 'search', 'access_check', 'verify', 'tidy')),
  title            text not null,
  points           int not null,
  proof_required   text not null,
  claimed_by       uuid references users(id),
  claimed_at       timestamptz,
  claim_expires_at timestamptz,
  status           text not null default 'open' check (status in ('open', 'claimed', 'submitted', 'completed', 'cancelled')),
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index missions_report_idx on missions (report_id);
create index missions_claimed_by_idx on missions (claimed_by, status);

create table mission_proofs (
  id            uuid primary key default gen_random_uuid(),
  mission_id    uuid not null references missions(id) on delete cascade,
  helper_id     uuid not null references users(id),
  photo_urls    text[] not null default '{}',
  speed_test    numeric,             -- Mbps, for Wi-Fi verify missions
  gps_point     geography(Point, 4326),
  taken_at      timestamptz not null default now(),
  ai_check      jsonb,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_by   uuid references users(id),
  reviewed_at   timestamptz
);

-- Append-only: rows are never deleted and delta/user never change.
-- Only `state` moves forward (pending -> spendable | reversed), enforced by ledger_guard.
create table points_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id),
  delta      int not null,
  reason     text not null,
  mission_id uuid references missions(id),
  proof_id   uuid references mission_proofs(id),
  report_id  uuid references reports(id),
  state      text not null default 'pending' check (state in ('pending', 'spendable', 'reversed')),
  created_at timestamptz not null default now()
);
create index points_ledger_user_idx on points_ledger (user_id, state);

create table rewards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cost_points int not null check (cost_points > 0),
  partner     text,
  stock       int                      -- null = unlimited
);

create table redemptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  reward_id    uuid not null references rewards(id),
  code         text unique not null,
  points_spent int not null,
  redeemed_at  timestamptz not null default now(),
  used_at      timestamptz
);

create table status_events (
  id          bigint generated always as identity primary key,
  report_id   uuid not null references reports(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor_id    uuid references users(id),
  at          timestamptz not null default now()
);
create index status_events_report_idx on status_events (report_id, at);

create table access_alerts (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null unique references reports(id) on delete cascade,
  affects        text[] not null default '{}',   -- wheelchair, crutches, low_vision, no_stairs
  obstacle_style text not null check (obstacle_style in ('zone', 'pothole', 'barrier', 'elevator', 'route')),
  impact         text not null check (impact in ('blocks', 'caution')),
  label          text,                           -- "Elevator out, floors 2–5"
  detour_text    text,
  detour_path    geography(LineString, 4326),
  blocked_path   geography(LineString, 4326),    -- red segment for obstacle_style = 'route'
  est_delay_min  int,
  confirmed      boolean not null default false  -- staff confirmed or 3 "Me too" votes
);

create table access_profiles (
  user_id        uuid primary key references users(id) on delete cascade,
  needs          text[] not null default '{}',
  alert_radius_m int not null default 150,
  travel_speed   numeric not null default 1.2,   -- m/s
  alerts_on      boolean not null default false
);

-- Preset paths for the "Simulate walk" demo button.
create table demo_paths (
  name text primary key,
  path geography(LineString, 4326) not null
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  text       text not null,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- Students registered with a department's volunteer program (register_volunteer). Only registered
-- volunteers can claim that department's student-solvable (self_fixable) tasks.
create table volunteer_registrations (
  user_id       uuid not null references users(id) on delete cascade,
  authority_id  text not null,             -- authority id from lib/categories.ts
  agreed_rules  boolean not null default true,
  registered_at timestamptz not null default now(),
  primary key (user_id, authority_id)
);

-- Same lists as lib/volunteer.ts.
create or replace function volunteer_departments() returns text[]
language sql immutable as $$ select array['fdo_custodial', 'fdo_grounds', 'fdo_maintenance', 'it_services', 'housing'] $$;

create or replace function service_minutes(p_type text) returns int
language sql immutable as $$
  select case p_type when 'tidy' then 15 when 'verify' then 5 when 'access_check' then 5 else 0 end
$$;

-- Student-solvable work needs a registration; lost-and-found runs and access checks don't.
create or replace function is_volunteer_task(p_fix fix_path, p_type text) returns boolean
language sql immutable as $$ select p_fix = 'self_fixable' and p_type in ('tidy', 'verify') $$;

-- Every moderator fix_path change, so the allowlist can be tuned.
create table fix_path_overrides (
  id           bigint generated always as identity primary key,
  report_id    uuid not null references reports(id) on delete cascade,
  from_path    fix_path not null,
  to_path      fix_path not null,
  moderator_id uuid references users(id),
  reason       text,
  at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Everything the map and ReportSheet need for a pin, as GeoJSON-friendly columns.
-- Claims past their 30-minute lock show as open (expiry is lazy; claim_mission resets the row).
create view reports_geo as
select
  r.id, r.reporter_id, r.kind, r.category, r.issue_type, r.severity, r.title, r.description,
  r.photo_urls,
  st_y(r.location::geometry) as lat,
  st_x(r.location::geometry) as lng,
  st_asgeojson(r.footprint)::jsonb as footprint,
  r.building, r.floor, r.fix_path, r.hazard_flags, r.access_impact, r.routed_to,
  r.cc, r.identified, r.routing_reason, r.report_subject, r.report_body,
  r.contains_sensitive, r.public_map, r.status, r.created_at,
  (select count(*) from report_votes v where v.report_id = r.id)::int as votes,
  lc.at as last_checked_at,
  lc.still_there as last_check_still,
  (select count(distinct c.user_id) from report_checks c
   where c.report_id = r.id and not c.still_there
     and c.at > coalesce((select max(s.at) from report_checks s where s.report_id = r.id and s.still_there), '-infinity'))::int
    as resolved_votes,
  m.id as mission_id,
  m.mission_type,
  m.title as mission_title,
  m.points as mission_points,
  m.proof_required,
  case when m.status = 'claimed' and m.claim_expires_at < now() then 'open' else m.status end as mission_status,
  case when m.status = 'claimed' and m.claim_expires_at < now() then null else m.claimed_by end as claimed_by,
  case when m.status = 'claimed' and m.claim_expires_at < now() then null else m.claim_expires_at end as claim_expires_at,
  i.category as item_category, i.color, i.brand, i.marks, i.radius_m, i.whereabouts,
  i.lost_from, i.lost_to,
  r.solvable_reason
from reports r
left join lateral (
  select * from missions mm
  where mm.report_id = r.id and mm.status in ('open', 'claimed', 'submitted')
  order by mm.created_at desc
  limit 1
) m on true
left join lateral (
  select c.at, c.still_there from report_checks c
  where c.report_id = r.id
  order by c.at desc
  limit 1
) lc on true
left join items i on i.report_id = r.id;

create view access_alerts_geo as
select
  a.id, a.report_id, a.affects, a.obstacle_style, a.impact, a.label, a.detour_text,
  st_asgeojson(a.detour_path)::jsonb as detour_path,
  st_asgeojson(a.blocked_path)::jsonb as blocked_path,
  a.est_delay_min,
  a.confirmed or (select count(*) from report_votes v where v.report_id = a.report_id) >= 3 as confirmed,
  r.title, r.category, r.status, r.building, r.floor,
  st_y(r.location::geometry) as lat,
  st_x(r.location::geometry) as lng,
  st_asgeojson(r.footprint)::jsonb as footprint
from access_alerts a
join reports r on r.id = a.report_id
where r.status not in ('resolved', 'closed');

create view demo_paths_geo as
select name, st_asgeojson(path)::jsonb as path from demo_paths;

create view balances as
select
  u.id as user_id,
  coalesce(sum(l.delta) filter (where l.state = 'pending'), 0)::int as pending,
  coalesce(sum(l.delta) filter (where l.state = 'spendable'), 0)::int as spendable
from users u
left join points_ledger l on l.user_id = u.id
group by u.id;

-- Each volunteer registration with the approved student-solvable work it credited.
create view volunteer_summary as
select
  v.user_id, v.authority_id, v.registered_at,
  coalesce(w.tasks_completed, 0) as tasks_completed,
  coalesce(w.service_minutes, 0) as service_minutes
from volunteer_registrations v
left join lateral (
  select count(*)::int as tasks_completed, sum(service_minutes(m.mission_type))::int as service_minutes
  from missions m
  join reports r on r.id = m.report_id
  where m.claimed_by = v.user_id and m.status = 'completed'
    and coalesce(r.routed_to, 'fdo_maintenance') = v.authority_id
    and is_volunteer_task(r.fix_path, m.mission_type)
) w on true;

-- Moderator queue: proofs with their mission and report.
create view proofs_review as
select
  p.id, p.mission_id, p.helper_id, hu.display_name as helper_name, p.photo_urls, p.speed_test,
  st_y(p.gps_point::geometry) as lat, st_x(p.gps_point::geometry) as lng,
  st_distance(p.gps_point, r.location)::int as distance_m,
  p.taken_at, p.ai_check, p.review_status, p.reviewed_by, p.reviewed_at,
  m.mission_type, m.title as mission_title, m.points,
  r.id as report_id, r.title as report_title, r.photo_urls as report_photo_urls, r.fix_path
from mission_proofs p
join missions m on m.id = p.mission_id
join reports r on r.id = m.report_id
join users hu on hu.id = p.helper_id;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function ledger_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'points_ledger is append-only';
  end if;
  if new.delta <> old.delta or new.user_id <> old.user_id or new.reason <> old.reason then
    raise exception 'points_ledger rows cannot be rewritten';
  end if;
  if old.state <> new.state and old.state <> 'pending' then
    raise exception 'ledger state can only move from pending';
  end if;
  return new;
end $$;

create trigger points_ledger_guard
before update or delete on points_ledger
for each row execute function ledger_guard();

create or replace function lcfirst(t text) returns text
language sql immutable as $$ select lower(left(t, 1)) || substr(t, 2) $$;

create or replace function set_report_status(p_report uuid, p_to text, p_actor uuid) returns void
language plpgsql set search_path = public, extensions as $$
declare
  v_from text;
begin
  select status into v_from from reports where id = p_report for update;
  if v_from is distinct from p_to then
    update reports set status = p_to where id = p_report;
    insert into status_events (report_id, from_status, to_status, actor_id)
    values (p_report, v_from, p_to, p_actor);
  end if;
end $$;

create or replace function notify_user(p_user uuid, p_text text, p_link text default null) returns void
language sql set search_path = public, extensions as $$
  insert into notifications (user_id, text, link) values (p_user, p_text, p_link);
$$;

create or replace function assert_not_banned(p_user uuid) returns void
language plpgsql set search_path = public, extensions as $$
begin
  if not exists (select 1 from users where id = p_user) then
    raise exception 'Unknown user';
  end if;
  if exists (select 1 from users where id = p_user and banned_at is not null) then
    raise exception 'This account is suspended';
  end if;
end $$;

create or replace function gen_checkin_code() returns text
language plpgsql set search_path = public, extensions as $$
declare
  v_code text;
begin
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from items where checkin_code = v_code);
  end loop;
  return v_code;
end $$;

-- Creates the mission a self_fixable report gets. Hazards and pests never become missions.
create or replace function create_fix_mission(p_report uuid) returns uuid
language plpgsql set search_path = public, extensions as $$
declare
  r reports;
  v_id uuid;
begin
  select * into r from reports where id = p_report;
  if r.fix_path <> 'self_fixable' or cardinality(r.hazard_flags) > 0 or r.category = 'pests' then
    return null;
  end if;
  if exists (select 1 from missions where report_id = p_report and status in ('open', 'claimed', 'submitted')) then
    return null;
  end if;

  insert into missions (report_id, mission_type, title, points, proof_required)
  select p_report, t.mission_type, t.title, t.points, t.proof_required
  from (
    select
      case r.category when 'waste' then 'tidy' when 'accessibility' then 'access_check' else 'verify' end as mission_type,
      case r.category
        when 'waste' then 'Quick tidy: ' || r.title
        when 'accessibility' then 'Is it still blocked? ' || r.title
        else 'Verify: ' || r.title
      end as title,
      case r.category when 'waste' then 10 when 'accessibility' then 10 else 5 end as points,
      case r.category
        when 'connectivity' then 'Speed test at the pin'
        when 'waste' then 'Before and after photos'
        else 'Geotagged photo at the pin'
      end as proof_required
  ) t
  returning id into v_id;

  perform set_report_status(p_report, 'mission_open', null);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- RPC functions called from lib/db.ts
-- ---------------------------------------------------------------------------

-- p: { kind, category, issue_type?, severity?, title, description?, photo_urls?, lat, lng,
--      building?, floor?, fix_path?, hazard_flags?, access_impact?, routed_to?, cc?, identified?,
--      routing_reason?, report_subject?, report_body?, contains_sensitive?, public_map?, solvable_reason?,
--      radius_m?, item_category?, color?, brand?, marks?, lost_from?, lost_to?, leave_for_delivery? }
create or replace function create_report(p_reporter uuid, p jsonb) returns setof reports_geo
language plpgsql set search_path = public, extensions as $$
declare
  v_id      uuid;
  v_kind    text := p->>'kind';
  v_loc     geography := st_setsrid(st_makepoint((p->>'lng')::float8, (p->>'lat')::float8), 4326)::geography;
  v_fix     fix_path := coalesce(
              nullif(p->>'fix_path', ''),
              case when v_kind in ('lost', 'found') then 'lost_found' else 'staff' end
            )::fix_path;
  v_dup     uuid;
  v_radius  int;
  v_style   text;
begin
  perform assert_not_banned(p_reporter);
  if v_kind not in ('issue', 'lost', 'found') then
    raise exception 'kind must be issue, lost or found';
  end if;

  -- Duplicate issue at the same pin within 24 hours: merge as a "Me too" instead of a new pin.
  if v_kind = 'issue' then
    select r.id into v_dup
    from reports r
    where r.kind = 'issue'
      and r.category = p->>'category'
      and coalesce(r.issue_type, '') = coalesce(p->>'issue_type', '')
      and r.created_at > now() - interval '24 hours'
      and r.status not in ('resolved', 'closed')
      and st_dwithin(r.location, v_loc, 25)
    order by r.created_at desc
    limit 1;

    if v_dup is not null then
      perform vote_me_too(v_dup, p_reporter);
      return query select * from reports_geo where id = v_dup;
      return;
    end if;
  end if;

  insert into reports (
    reporter_id, kind, category, issue_type, severity, title, description, photo_urls,
    location, building, floor, fix_path, hazard_flags, access_impact, routed_to,
    cc, identified, routing_reason, report_subject, report_body, contains_sensitive, public_map, solvable_reason
  ) values (
    p_reporter, v_kind,
    coalesce(p->>'category', case when v_kind = 'issue' then 'other' else 'lost_found' end),
    p->>'issue_type',
    (p->>'severity')::smallint,
    coalesce(p->>'title', 'Untitled report'),
    p->>'description',
    coalesce(array(select jsonb_array_elements_text(p->'photo_urls')), '{}'),
    v_loc,
    p->>'building',
    p->>'floor',
    v_fix,
    coalesce(array(select jsonb_array_elements_text(p->'hazard_flags')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p->'access_impact')), '{}'),
    p->>'routed_to',
    coalesce(array(select jsonb_array_elements_text(p->'cc')), '{}'),
    p->>'identified',
    p->>'routing_reason',
    p->>'report_subject',
    p->>'report_body',
    coalesce((p->>'contains_sensitive')::boolean, false),
    case when v_kind = 'issue' then true else coalesce((p->>'public_map')::boolean, true) end,
    p->>'solvable_reason'
  ) returning id into v_id;

  insert into status_events (report_id, from_status, to_status, actor_id)
  values (v_id, null, 'submitted', p_reporter);

  -- A student-reported barrier becomes an unconfirmed obstacle; it reaches the HUD once
  -- staff confirm it or 3 students tap "Me too".
  if v_kind = 'issue' and jsonb_array_length(coalesce(p->'access_impact', '[]'::jsonb)) > 0 then
    v_style := case
      when coalesce(p->>'issue_type', '') ~* 'elevator' then 'elevator'
      when coalesce(p->>'issue_type', '') ~* 'construction|barricade|fence|road_?work' then 'zone'
      else 'pothole'
    end;
    -- Zones need an area to stand up in 3D; a student pin gets a small one around it.
    if v_style = 'zone' then
      update reports set footprint = st_buffer(v_loc, 12, 'quad_segs=2')::geography where id = v_id;
    end if;
    insert into access_alerts (report_id, affects, obstacle_style, impact, label)
    values (
      v_id,
      array(select jsonb_array_elements_text(p->'access_impact')),
      v_style,
      case when coalesce((p->>'severity')::int, 2) >= 4 then 'blocks' else 'caution' end,
      coalesce(p->>'title', 'Access barrier')
    );
  end if;

  if v_kind in ('lost', 'found') then
    v_radius := coalesce((p->>'radius_m')::int, case when v_kind = 'lost' then 50 else 10 end);
    insert into items (
      report_id, category, color, brand, marks, radius_m, area, lost_from, lost_to, whereabouts, checkin_code
    ) values (
      v_id,
      coalesce(p->>'item_category', p->>'issue_type'),
      p->>'color', p->>'brand', p->>'marks',
      v_radius,
      st_buffer(v_loc, v_radius)::geography,
      (p->>'lost_from')::timestamptz,
      (p->>'lost_to')::timestamptz,
      case when v_kind = 'found' then 'with_finder' end,
      case when v_kind = 'found' then gen_checkin_code() end
    );

    if v_kind = 'lost' then
      insert into missions (report_id, mission_type, title, points, proof_required)
      values (
        v_id, 'search',
        'Keep an eye out for ' || lcfirst(coalesce(p->>'title', 'a lost item'))
          || coalesce(', ' || nullif(concat_ws(' floor ', p->>'building', p->>'floor'), ''), ''),
        50, 'A matching found report checked in at Lost & Found'
      );
      perform set_report_status(v_id, 'searching', p_reporter);
    else
      if coalesce((p->>'leave_for_delivery')::boolean, false) then
        insert into missions (report_id, mission_type, title, points, proof_required)
        values (v_id, 'delivery', 'Carry ' || lcfirst(coalesce(p->>'title', 'a found item')) || ' to Lost & Found',
                50, 'Office check-in scan');
      end if;
      perform set_report_status(v_id, 'with_finder', p_reporter);
    end if;
  elsif v_fix = 'self_fixable' then
    perform create_fix_mission(v_id);
  elsif p->>'routed_to' is not null then
    perform set_report_status(v_id, 'routed', null);
  end if;

  return query select * from reports_geo where id = v_id;
end $$;

create or replace function vote_me_too(p_report uuid, p_user uuid) returns void
language plpgsql set search_path = public, extensions as $$
begin
  perform assert_not_banned(p_user);
  insert into report_votes (report_id, user_id) values (p_report, p_user)
  on conflict do nothing;
  -- A student-reported obstacle starts alerting at 3 "Me too" votes.
  if (select count(*) from report_votes where report_id = p_report) >= 3 then
    update access_alerts set confirmed = true where report_id = p_report and not confirmed;
  end if;
end $$;

-- "Still there" also counts as a Me too. Three different students saying "looks resolved" after the
-- last "still there" resolve the issue, cancel its open mission and take it off the map.
create or replace function check_report(p_report uuid, p_user uuid, p_still boolean) returns void
language plpgsql set search_path = public, extensions as $$
declare
  r reports;
  v_resolved int;
begin
  perform assert_not_banned(p_user);
  select * into r from reports where id = p_report for update;
  if not found then
    raise exception 'Report not found';
  end if;
  insert into report_checks (report_id, user_id, still_there) values (p_report, p_user, p_still);

  if p_still then
    if p_user is distinct from r.reporter_id then
      perform vote_me_too(p_report, p_user);
    end if;
    return;
  end if;

  select resolved_votes into v_resolved from reports_geo where id = p_report;
  if v_resolved >= 3 and r.kind = 'issue' and r.status not in ('resolved', 'verified', 'closed') then
    perform set_report_status(p_report, 'resolved', null);
    update missions set status = 'cancelled' where report_id = p_report and status in ('open', 'claimed');
    if r.reporter_id is not null then
      perform notify_user(r.reporter_id, format('Students say "%s" looks resolved. It''s off the map now.', r.title), '/?report=' || p_report);
    end if;
  end if;
end $$;

-- 30-minute lock; no claiming your own report; one active claim per student; student-solvable
-- tasks only for students registered with the report's department.
create or replace function claim_mission(p_mission uuid, p_user uuid) returns missions
language plpgsql set search_path = public, extensions as $$
declare
  m missions;
  v_reporter uuid;
  v_fix fix_path;
  v_dept text;
begin
  perform assert_not_banned(p_user);
  perform 1 from users where id = p_user for update;  -- serialize this student's claims

  select * into m from missions where id = p_mission for update;
  if not found then
    raise exception 'Mission not found';
  end if;
  if m.status = 'claimed' and m.claim_expires_at < now() then
    m.status := 'open';  -- previous claim timed out
  end if;
  if m.status <> 'open' then
    raise exception 'Someone else is already on this mission';
  end if;

  select reporter_id, fix_path, coalesce(routed_to, 'fdo_maintenance')
  into v_reporter, v_fix, v_dept
  from reports where id = m.report_id;
  if v_reporter = p_user then
    raise exception 'You cannot claim a mission on your own report';
  end if;
  if is_volunteer_task(v_fix, m.mission_type) and not exists (
    select 1 from volunteer_registrations where user_id = p_user and authority_id = v_dept
  ) then
    raise exception 'Register to volunteer with this department before claiming this task';
  end if;

  if exists (
    select 1 from missions
    where claimed_by = p_user and id <> p_mission
      and status = 'claimed' and claim_expires_at > now()
  ) then
    raise exception 'You already have an active mission. Finish it or let it expire first';
  end if;

  update missions
  set status = 'claimed', claimed_by = p_user, claimed_at = now(),
      claim_expires_at = now() + interval '30 minutes'
  where id = p_mission
  returning * into m;

  if m.mission_type not in ('search', 'delivery') then
    perform set_report_status(m.report_id, 'in_progress', p_user);
  end if;
  return m;
end $$;

-- Proof must come from the claimer, before the lock expires, within 50 m of the pin.
-- Points land as pending until a moderator reviews them.
create or replace function submit_proof(
  p_mission uuid, p_user uuid, p_photo_urls text[], p_lat float8, p_lng float8,
  p_speed_test numeric default null, p_taken_at timestamptz default now()
) returns mission_proofs
language plpgsql set search_path = public, extensions as $$
declare
  m missions;
  v_point geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_dist float8;
  pr mission_proofs;
begin
  select * into m from missions where id = p_mission for update;
  if not found then
    raise exception 'Mission not found';
  end if;
  if m.claimed_by is distinct from p_user or m.status <> 'claimed' then
    raise exception 'Claim this mission before sending proof';
  end if;
  if m.claim_expires_at < now() then
    raise exception 'Your 30-minute claim expired. Claim the mission again';
  end if;
  if p_taken_at < m.claimed_at then
    raise exception 'Proof must be taken after you claimed the mission';
  end if;

  select st_distance(location, v_point) into v_dist from reports where id = m.report_id;
  if v_dist > 50 then
    raise exception 'Proof must be taken within 50 m of the pin (you were % m away)', round(v_dist);
  end if;

  insert into mission_proofs (mission_id, helper_id, photo_urls, speed_test, gps_point, taken_at)
  values (p_mission, p_user, coalesce(p_photo_urls, '{}'), p_speed_test, v_point, p_taken_at)
  returning * into pr;

  update missions set status = 'submitted' where id = p_mission;

  insert into points_ledger (user_id, delta, reason, mission_id, proof_id, report_id, state)
  values (p_user, m.points, 'mission:' || m.mission_type, m.id, pr.id, m.report_id, 'pending');

  perform set_report_status(m.report_id, 'verifying', p_user);
  return pr;
end $$;

-- Approve makes the pending points spendable; reject reverses them and reopens the mission.
create or replace function review_proof(p_proof uuid, p_approve boolean, p_moderator uuid) returns void
language plpgsql set search_path = public, extensions as $$
declare
  pr mission_proofs;
  m missions;
  r reports;
  v_service int;
begin
  select * into pr from mission_proofs where id = p_proof for update;
  if not found then
    raise exception 'Proof not found';
  end if;
  if pr.review_status <> 'pending' then
    raise exception 'This proof was already reviewed';
  end if;
  select * into m from missions where id = pr.mission_id for update;
  select * into r from reports where id = m.report_id;

  update mission_proofs
  set review_status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = p_moderator, reviewed_at = now()
  where id = p_proof;

  update points_ledger
  set state = case when p_approve then 'spendable' else 'reversed' end
  where proof_id = p_proof and state = 'pending';

  if p_approve then
    update missions set status = 'completed', completed_at = now() where id = m.id;
    perform set_report_status(r.id, case when m.mission_type = 'tidy' then 'resolved' else 'verified' end, p_moderator);
    v_service := case when is_volunteer_task(r.fix_path, m.mission_type) then service_minutes(m.mission_type) else 0 end;
    perform notify_user(
      pr.helper_id,
      case when v_service > 0
        then format('+%s points and %s min of community service approved: %s', m.points, v_service, m.title)
        else format('+%s points approved: %s', m.points, m.title)
      end,
      '/missions'
    );
    if r.reporter_id is not null and r.reporter_id <> pr.helper_id then
      perform notify_user(r.reporter_id, format('A student checked your report: %s', r.title), '/?report=' || r.id);
    end if;
  else
    update missions
    set status = 'open', claimed_by = null, claimed_at = null, claim_expires_at = null
    where id = m.id;
    perform set_report_status(r.id, 'mission_open', p_moderator);
    perform notify_user(pr.helper_id, format('Proof not accepted for "%s". The %s pending points were reversed.', m.title, m.points), '/missions');
  end if;
end $$;

-- Office desk scans the finder's QR / types the 6-digit code.
-- Item moves to "at office", the finder (or the student who claimed the delivery) gets +50.
-- DEMO: points are spendable right away; the real build holds them pending for 24 hours.
create or replace function check_in_item(p_code text, p_actor uuid default null)
returns table (item_title text, points int, finder_id uuid, report_id uuid)
language plpgsql set search_path = public, extensions as $$
#variable_conflict use_column
declare
  i items;
  r reports;
  v_benef uuid;
  v_delivery uuid;
  v_points int := 50;
  l record;
begin
  select * into i from items where checkin_code = trim(p_code) for update;
  if not found then
    raise exception 'No found item with code %', trim(p_code);
  end if;
  if i.whereabouts <> 'with_finder' then
    raise exception 'This item was already checked in';
  end if;
  select * into r from reports where id = i.report_id;
  v_benef := r.reporter_id;

  -- If another student claimed the delivery mission, they carried it in.
  select id, claimed_by into v_delivery, v_benef
  from missions
  where missions.report_id = r.id and mission_type = 'delivery'
    and status = 'claimed' and claim_expires_at > now()
  limit 1;
  if v_delivery is null then
    v_benef := r.reporter_id;
  else
    update missions set status = 'completed', completed_at = now() where id = v_delivery;
  end if;
  update missions set status = 'cancelled'
  where missions.report_id = r.id and mission_type = 'delivery' and status in ('open', 'claimed');

  -- No return reward for an item you reported lost yourself.
  if exists (
    select 1 from matches mt join reports lr on lr.id = mt.lost_report_id
    where mt.found_report_id = r.id and mt.status <> 'rejected' and lr.reporter_id = v_benef
  ) then
    v_points := 0;
  end if;

  update items set whereabouts = 'at_office', office_checkin_at = now() where items.report_id = r.id;

  if v_points > 0 then
    insert into points_ledger (user_id, delta, reason, mission_id, report_id, state)
    values (v_benef, v_points, 'return_checkin', v_delivery, r.id, 'spendable');
    perform notify_user(v_benef, format('+%s points: %s was checked in at Lost & Found. Thank you!', v_points, r.title), '/rewards');
  end if;

  perform set_report_status(r.id, 'checked_in', p_actor);

  -- Tell the owners of matched lost reports and close their search missions.
  for l in
    select lr.id, lr.reporter_id, lr.title from matches mt join reports lr on lr.id = mt.lost_report_id
    where mt.found_report_id = r.id and mt.status <> 'rejected'
  loop
    perform set_report_status(l.id, 'checked_in', p_actor);
    update missions set status = 'completed', completed_at = now()
    where missions.report_id = l.id and mission_type = 'search' and status in ('open', 'claimed', 'submitted');
    perform notify_user(l.reporter_id, format('Your %s is at the Lost & Found office. Bring your student ID to pick it up.', lcfirst(l.title)), '/inbox');
  end loop;

  return query select r.title, v_points, v_benef, r.id;
end $$;

-- Owner picked the item up at the office: +25 bonus to whoever got the check-in points.
-- Accepts either the found report id or a matched lost report id.
create or replace function mark_picked_up(p_report uuid, p_actor uuid default null) returns void
language plpgsql set search_path = public, extensions as $$
declare
  v_found uuid;
  v_benef uuid;
  i items;
  l record;
  v_title text;
begin
  if (select kind from reports where id = p_report) = 'found' then
    v_found := p_report;
  else
    select found_report_id into v_found from matches
    where lost_report_id = p_report and status <> 'rejected'
    order by (status = 'confirmed') desc, score desc
    limit 1;
  end if;
  if v_found is null then
    raise exception 'No found item linked to this report';
  end if;

  select * into i from items where report_id = v_found for update;
  if i.whereabouts <> 'at_office' then
    raise exception 'Item is not at the Lost & Found office';
  end if;
  update items set whereabouts = 'picked_up', picked_up_at = now() where report_id = v_found;
  select title into v_title from reports where id = v_found;

  select user_id into v_benef from points_ledger
  where report_id = v_found and reason = 'return_checkin'
  limit 1;
  if v_benef is not null then
    insert into points_ledger (user_id, delta, reason, report_id, state)
    values (v_benef, 25, 'owner_pickup', v_found, 'spendable');
    perform notify_user(v_benef, format('+25 bonus: the owner picked up %s', lcfirst(v_title)), '/rewards');
  end if;

  perform set_report_status(v_found, 'closed', p_actor);
  for l in
    select mt.lost_report_id as id from matches mt
    where mt.found_report_id = v_found and mt.status <> 'rejected'
  loop
    update matches set status = 'confirmed' where lost_report_id = l.id and found_report_id = v_found;
    perform set_report_status(l.id, 'closed', p_actor);
  end loop;
end $$;

-- Checks spendable balance and the 300-point weekly cap, then returns a 6-character code.
create or replace function redeem_reward(p_reward uuid, p_user uuid) returns text
language plpgsql set search_path = public, extensions as $$
declare
  rw rewards;
  v_balance int;
  v_week int;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O or 1/I
begin
  perform assert_not_banned(p_user);
  perform 1 from users where id = p_user for update;  -- serialize this student's spending

  select * into rw from rewards where id = p_reward for update;
  if not found then
    raise exception 'Reward not found';
  end if;
  if rw.stock is not null and rw.stock <= 0 then
    raise exception '% is out of stock', rw.name;
  end if;

  select coalesce(sum(delta), 0) into v_balance
  from points_ledger where user_id = p_user and state = 'spendable';
  if v_balance < rw.cost_points then
    raise exception 'Not enough points: you have %, this costs %', v_balance, rw.cost_points;
  end if;

  select coalesce(sum(points_spent), 0) into v_week
  from redemptions where user_id = p_user and redeemed_at > now() - interval '7 days';
  if v_week + rw.cost_points > 300 then
    raise exception 'Weekly limit reached: up to 300 points a week (% used)', v_week;
  end if;

  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
    into v_code from generate_series(1, 6);
    exit when not exists (select 1 from redemptions where code = v_code);
  end loop;

  insert into redemptions (user_id, reward_id, code, points_spent)
  values (p_user, p_reward, v_code, rw.cost_points);
  insert into points_ledger (user_id, delta, reason, state)
  values (p_user, -rw.cost_points, 'redeem:' || rw.name, 'spendable');
  update rewards set stock = stock - 1 where id = p_reward and stock is not null;

  return v_code;
end $$;

-- Called by the report flow after /api/match scores a found item >= 0.6 against a lost report.
create or replace function create_match(p_lost uuid, p_found uuid, p_score numeric) returns matches
language plpgsql set search_path = public, extensions as $$
declare
  mt matches;
  lr reports;
  v_where text;
begin
  select * into lr from reports where id = p_lost;
  if lr.kind <> 'lost' or (select kind from reports where id = p_found) <> 'found' then
    raise exception 'create_match needs a lost report and a found report';
  end if;

  insert into matches (lost_report_id, found_report_id, score)
  values (p_lost, p_found, p_score)
  on conflict (lost_report_id, found_report_id) do update set score = greatest(matches.score, excluded.score)
  returning * into mt;

  select whereabouts into v_where from items where report_id = p_found;
  perform notify_user(
    lr.reporter_id,
    format('Possible match for your %s. %s', lcfirst(lr.title),
      case when v_where = 'with_finder' then 'The finder is bringing it to the Lost & Found office.'
           else 'It''s at the Lost & Found office.' end),
    '/matches/' || mt.id
  );
  if lr.status = 'searching' then
    perform set_report_status(p_lost, 'matched', null);
  end if;
  return mt;
end $$;

-- Owner taps Confirm / Not mine on the match review screen.
create or replace function respond_to_match(p_match uuid, p_confirm boolean, p_user uuid) returns void
language plpgsql set search_path = public, extensions as $$
declare
  mt matches;
  fr reports;
begin
  select * into mt from matches where id = p_match for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if (select reporter_id from reports where id = mt.lost_report_id) is distinct from p_user then
    raise exception 'Only the owner can respond to this match';
  end if;
  update matches set status = case when p_confirm then 'confirmed' else 'rejected' end where id = p_match;
  if p_confirm then
    select * into fr from reports where id = mt.found_report_id;
    if fr.reporter_id is not null and fr.reporter_id <> p_user then
      perform notify_user(
        fr.reporter_id,
        format('The owner confirmed the %s you found is theirs.', lcfirst(fr.title)),
        '/matches/' || mt.id
      );
    end if;
  end if;
  if not p_confirm and not exists (
    select 1 from matches where lost_report_id = mt.lost_report_id and status <> 'rejected'
  ) then
    perform set_report_status(mt.lost_report_id, 'searching', p_user);
  end if;
end $$;

-- Joins a department's volunteer program after the student agrees to its safety rules.
create or replace function register_volunteer(p_user uuid, p_authority text) returns void
language plpgsql set search_path = public, extensions as $$
begin
  perform assert_not_banned(p_user);
  if not (p_authority = any (volunteer_departments())) then
    raise exception 'This department doesn''t take student volunteers';
  end if;
  insert into volunteer_registrations (user_id, authority_id) values (p_user, p_authority)
  on conflict do nothing;
  if found then
    perform notify_user(p_user, 'You''re registered as a volunteer. You can now claim this department''s student-solvable tasks.', '/missions');
  end if;
end $$;

-- Moderator override, logged so the allowlist can be tuned.
create or replace function override_fix_path(p_report uuid, p_to fix_path, p_moderator uuid, p_reason text default null)
returns void
language plpgsql set search_path = public, extensions as $$
declare
  v_from fix_path;
begin
  select fix_path into v_from from reports where id = p_report for update;
  if v_from is null then
    raise exception 'Report not found';
  end if;
  if v_from = p_to then
    return;
  end if;
  insert into fix_path_overrides (report_id, from_path, to_path, moderator_id, reason)
  values (p_report, v_from, p_to, p_moderator, p_reason);
  update reports set fix_path = p_to where id = p_report;

  if p_to = 'self_fixable' then
    perform create_fix_mission(p_report);
  elsif p_to = 'staff' then
    update missions set status = 'cancelled'
    where report_id = p_report and status in ('open', 'claimed');
    perform set_report_status(p_report, 'routed', p_moderator);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Demo security: permissive RLS (say so in the pitch)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'reports', 'report_votes', 'report_checks', 'items', 'matches', 'missions', 'mission_proofs',
    'points_ledger', 'rewards', 'redemptions', 'status_events', 'access_alerts',
    'access_profiles', 'demo_paths', 'notifications', 'fix_path_overrides', 'volunteer_registrations'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy demo_all on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime + Storage (Supabase only; skipped when run on plain Postgres)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'reports', 'missions', 'matches', 'points_ledger', 'notifications',
      'report_votes', 'report_checks', 'items', 'access_alerts', 'volunteer_registrations'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;

  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
    on conflict (id) do update set public = true;

    drop policy if exists "photos demo read" on storage.objects;
    drop policy if exists "photos demo upload" on storage.objects;
    create policy "photos demo read" on storage.objects for select using (bucket_id = 'photos');
    create policy "photos demo upload" on storage.objects for insert with check (bucket_id = 'photos');
  end if;
end $$;
