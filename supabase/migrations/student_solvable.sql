-- Student solvable tasks and department volunteer sign-up.
-- Run once in the Supabase SQL editor on a database set up with an earlier schema.sql.
-- Keeps existing data. Fresh setups can run schema.sql and seed.sql instead, which include all of this.
-- Generated from schema.sql; keep the two in step.

set search_path = public, extensions;

alter table reports add column if not exists public_map boolean not null default true;
alter table reports add column if not exists solvable_reason text;

create table if not exists volunteer_registrations (
  user_id       uuid not null references users(id) on delete cascade,
  authority_id  text not null,             -- authority id from lib/categories.ts
  agreed_rules  boolean not null default true,
  registered_at timestamptz not null default now(),
  primary key (user_id, authority_id)
);

create or replace function volunteer_departments() returns text[]
language sql immutable as $$ select array['fdo_custodial', 'fdo_grounds', 'fdo_maintenance', 'it_services', 'housing'] $$;

create or replace function service_minutes(p_type text) returns int
language sql immutable as $$
  select case p_type when 'tidy' then 15 when 'verify' then 5 when 'access_check' then 5 else 0 end
$$;

-- Student-solvable work needs a registration; lost-and-found runs and access checks don't.
create or replace function is_volunteer_task(p_fix fix_path, p_type text) returns boolean
language sql immutable as $$ select p_fix = 'self_fixable' and p_type in ('tidy', 'verify') $$;

-- New columns change the view's shape, so it is rebuilt. create_report returns its rows and is
-- recreated below.
drop view if exists reports_geo cascade;
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

create or replace view volunteer_summary as
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

alter table volunteer_registrations enable row level security;
drop policy if exists demo_all on volunteer_registrations;
create policy demo_all on volunteer_registrations for all using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'volunteer_registrations'
     ) then
    alter publication supabase_realtime add table public.volunteer_registrations;
  end if;
end $$;

-- Demo: Maya is already on the Campus Cleanup Crew. Leo is not, so his first claim shows the sign-up.
insert into volunteer_registrations (user_id, authority_id, registered_at)
select id, 'fdo_custodial', now() - interval '6 days' from users where id = 'a0000000-0000-4000-8000-000000000001'
on conflict do nothing;
