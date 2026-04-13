-- 0008_community_v2.sql
-- Adds: professor_name, is_anonymous to community_posts
--       community_post_upvotes table
--       notifications table
--       refreshed community_posts_with_author view (upvote_count, user_has_upvoted)
-- Run in Supabase SQL Editor or via supabase db push.

-- ---------------------------------------------------------------------------
-- Extend community_posts
-- ---------------------------------------------------------------------------

alter table public.community_posts
  add column if not exists professor_name text,
  add column if not exists is_anonymous boolean not null default false;

-- ---------------------------------------------------------------------------
-- Upvotes table
-- ---------------------------------------------------------------------------

create table if not exists public.community_post_upvotes (
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_post_upvotes_post_idx
  on public.community_post_upvotes (post_id);

-- ---------------------------------------------------------------------------
-- Notifications table
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null,
  payload    jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_read_created_idx
  on public.notifications (user_id, read, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — community_post_upvotes
-- ---------------------------------------------------------------------------

alter table public.community_post_upvotes enable row level security;

drop policy if exists "upvotes_select_all" on public.community_post_upvotes;
create policy "upvotes_select_all"
  on public.community_post_upvotes for select
  to authenticated
  using (true);

drop policy if exists "upvotes_insert_own" on public.community_post_upvotes;
create policy "upvotes_insert_own"
  on public.community_post_upvotes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "upvotes_delete_own" on public.community_post_upvotes;
create policy "upvotes_delete_own"
  on public.community_post_upvotes for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS — notifications
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_insert_any" on public.notifications;
create policy "notifications_insert_any"
  on public.notifications for insert
  to authenticated
  with check (true);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Refresh community_posts_with_author view
-- Must DROP first because we are adding columns to the view definition.
-- ---------------------------------------------------------------------------

drop view if exists public.community_posts_with_author;

create view public.community_posts_with_author
  with (security_invoker = true)
as
select
  cp.id,
  cp.user_id,
  cp.title,
  cp.body,
  cp.course_code,
  cp.professor_name,
  cp.is_anonymous,
  cp.created_at,
  cp.updated_at,
  case
    when cp.is_anonymous then 'Anonymous'
    else coalesce(p.display_name, 'Anonymous')
  end as author_display_name,
  (
    select count(*)::int
    from public.community_replies cr
    where cr.post_id = cp.id
  ) as reply_count,
  (
    select count(*)::int
    from public.community_post_upvotes cpu
    where cpu.post_id = cp.id
  ) as upvote_count,
  exists (
    select 1
    from public.community_post_upvotes cpu2
    where cpu2.post_id = cp.id
      and cpu2.user_id = auth.uid()
  ) as user_has_upvoted
from public.community_posts cp
left join public.profiles p on p.id = cp.user_id;
