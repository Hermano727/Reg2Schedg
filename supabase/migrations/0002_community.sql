-- Community Center: posts, replies, views, RLS.
-- Run in Supabase SQL Editor or via supabase db push.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  course_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_course_created_idx
  on public.community_posts (course_code, created_at desc)
  where course_code is not null;

create index if not exists community_posts_created_idx
  on public.community_posts (created_at desc);

create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_replies_post_created_idx
  on public.community_replies (post_id, created_at asc);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at
-- ---------------------------------------------------------------------------

drop trigger if exists community_posts_set_updated_at on public.community_posts;
create trigger community_posts_set_updated_at
  before update on public.community_posts
  for each row execute procedure public.set_updated_at();

drop trigger if exists community_replies_set_updated_at on public.community_replies;
create trigger community_replies_set_updated_at
  before update on public.community_replies
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;

drop policy if exists "community_posts_select_all" on public.community_posts;
create policy "community_posts_select_all"
  on public.community_posts for select
  to authenticated
  using (true);

drop policy if exists "community_posts_insert_own" on public.community_posts;
create policy "community_posts_insert_own"
  on public.community_posts for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "community_posts_update_own" on public.community_posts;
create policy "community_posts_update_own"
  on public.community_posts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "community_posts_delete_own" on public.community_posts;
create policy "community_posts_delete_own"
  on public.community_posts for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "community_replies_select_all" on public.community_replies;
create policy "community_replies_select_all"
  on public.community_replies for select
  to authenticated
  using (true);

drop policy if exists "community_replies_insert_own" on public.community_replies;
create policy "community_replies_insert_own"
  on public.community_replies for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "community_replies_update_own" on public.community_replies;
create policy "community_replies_update_own"
  on public.community_replies for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "community_replies_delete_own" on public.community_replies;
create policy "community_replies_delete_own"
  on public.community_replies for delete
  to authenticated
  using (user_id = auth.uid());

-- Allow authenticated users to read any profile's display_name (needed by views)
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Views with author join
-- ---------------------------------------------------------------------------

create or replace view public.community_posts_with_author
  with (security_invoker = true)
as
select
  cp.id,
  cp.user_id,
  cp.title,
  cp.body,
  cp.course_code,
  cp.created_at,
  cp.updated_at,
  coalesce(p.display_name, 'Anonymous') as author_display_name,
  (
    select count(*)::int
    from public.community_replies cr
    where cr.post_id = cp.id
  ) as reply_count
from public.community_posts cp
left join public.profiles p on p.id = cp.user_id;

create or replace view public.community_replies_with_author
  with (security_invoker = true)
as
select
  cr.id,
  cr.post_id,
  cr.user_id,
  cr.body,
  cr.created_at,
  cr.updated_at,
  coalesce(p.display_name, 'Anonymous') as author_display_name
from public.community_replies cr
left join public.profiles p on p.id = cr.user_id;
