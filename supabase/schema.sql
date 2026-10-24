-- Campus Quests: tables used by reporting, triage and lost & found matching.
-- Run in the Supabase SQL editor. Follows the MASTER.md data model; lat/lng are kept as
-- plain columns for the app and mirrored into a PostGIS `location` for map queries.

create extension if not exists postgis;
create extension if not exists pgcrypto;

do $$ begin
  create type fix_path as enum ('staff', 'self_fixable', 'lost_found');
exception when duplicate_object then null; end $$;

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  sjsu_email    text unique not null,
  display_name  text not null,
  role          text not null default 'student',
  banned_at     timestamptz
);

-- Demo identities (lib/users.ts)
insert into users (id, sjsu_email, display_name, role) values
  ('00000000-0000-4000-8000-000000000001', 'maya@sjsu.edu', 'Maya', 'student'),
  ('00000000-0000-4000-8000-000000000002', 'leo@sjsu.edu', 'Leo', 'student'),
  ('00000000-0000-4000-8000-000000000003', 'lostandfound@sjsu.edu', 'L&F Office', 'office')
on conflict (id) do nothing;

create table if not exists reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter_id        uuid references users(id),
  kind               text check (kind in ('issue', 'lost', 'found')),
  category           text,       -- see ISSUE_CATEGORIES in lib/categories.ts, or lost_found
  issue_type         text,
  severity           smallint,
  title              text,
  description        text,
  photo_urls         text[] default '{}',
  lat                double precision not null,
  lng                double precision not null,
  location           geography(Point, 4326)
                       generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  footprint          geography(Polygon, 4326),
  building           text,
  floor              text,
  fix_path           fix_path not null,
  hazard_flags       text[] default '{}',
  access_impact      text[] default '{}',
  routed_to          text,       -- authority id chosen by Claude triage (lib/categories.ts)
  cc                 text[] default '{}',
  identified         text,       -- what the vision model saw in the photo
  routing_reason     text,
  report_subject     text,       -- the report sent to the authority
  report_body        text,
  contains_sensitive boolean not null default false,
  status             text not null default 'submitted',
  created_at         timestamptz default now()
);

create table if not exists items (
  report_id         uuid primary key references reports(id) on delete cascade,
  category          text,        -- item type, e.g. airpods_case
  color             text,
  brand             text,
  marks             text,
  image_embedding   jsonb,
  radius_m          integer,     -- lost reports: approximate area
  lost_from         timestamptz,
  lost_to           timestamptz,
  whereabouts       text check (whereabouts in ('with_finder', 'at_office', 'picked_up')),
  office_checkin_at timestamptz
);

create table if not exists matches (
  id               uuid primary key default gen_random_uuid(),
  lost_report_id   uuid references reports(id) on delete cascade,
  found_report_id  uuid references reports(id) on delete cascade,
  score            real not null,
  status           text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  created_at       timestamptz default now(),
  unique (lost_report_id, found_report_id)
);

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  title       text not null,
  body        text not null,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz default now()
);

create index if not exists reports_open_lost on reports (created_at desc) where kind = 'lost' and status = 'open';
create index if not exists reports_routed on reports (routed_to, created_at desc);
create index if not exists notifications_user on notifications (user_id, created_at desc);

-- Public bucket for report photos
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do nothing;

-- Realtime for the map and the inbox bell
alter publication supabase_realtime add table reports;
alter publication supabase_realtime add table notifications;
