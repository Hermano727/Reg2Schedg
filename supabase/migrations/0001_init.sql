-- Reg2Schedg: profiles, saved plans, vault metadata, RLS, Storage bucket policies.
-- Run in Supabase SQL Editor or via supabase db push.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  college text,
  expected_grad_term text,
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  quarter_label text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'complete')),
  payload_version smallint not null default 1,
  payload jsonb not null default '{}',
  source_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_plans_user_updated_idx
  on public.saved_plans (user_id, updated_at desc);

create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references public.saved_plans (id) on delete set null,
  name text not null,
  kind text not null check (kind in ('syllabus', 'webreg', 'note')),
  storage_path text not null,
  updated_at timestamptz not null default now()
);

create index if not exists vault_items_user_updated_idx
  on public.vault_items (user_id, updated_at desc);

create index if not exists vault_items_plan_idx
  on public.vault_items (plan_id)
  where plan_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers: updated_at + profile on signup + vault plan ownership
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists saved_plans_set_updated_at on public.saved_plans;
create trigger saved_plans_set_updated_at
  before update on public.saved_plans
  for each row execute procedure public.set_updated_at();

drop trigger if exists vault_items_set_updated_at on public.vault_items;
create trigger vault_items_set_updated_at
  before update on public.vault_items
  for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.vault_items_plan_must_match_user()
returns trigger
language plpgsql
as $$
begin
  if new.plan_id is not null then
    if not exists (
      select 1
      from public.saved_plans sp
      where sp.id = new.plan_id
        and sp.user_id = new.user_id
    ) then
      raise exception 'vault_items.plan_id must reference a saved_plan owned by the same user';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vault_items_plan_user_check on public.vault_items;
create trigger vault_items_plan_user_check
  before insert or update on public.vault_items
  for each row execute procedure public.vault_items_plan_must_match_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.saved_plans enable row level security;
alter table public.vault_items enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "saved_plans_select_own" on public.saved_plans;
create policy "saved_plans_select_own"
  on public.saved_plans for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "saved_plans_insert_own" on public.saved_plans;
create policy "saved_plans_insert_own"
  on public.saved_plans for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "saved_plans_update_own" on public.saved_plans;
create policy "saved_plans_update_own"
  on public.saved_plans for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "saved_plans_delete_own" on public.saved_plans;
create policy "saved_plans_delete_own"
  on public.saved_plans for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "vault_items_select_own" on public.vault_items;
create policy "vault_items_select_own"
  on public.vault_items for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "vault_items_insert_own" on public.vault_items;
create policy "vault_items_insert_own"
  on public.vault_items for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "vault_items_update_own" on public.vault_items;
create policy "vault_items_update_own"
  on public.vault_items for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "vault_items_delete_own" on public.vault_items;
create policy "vault_items_delete_own"
  on public.vault_items for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private bucket + per-user folder (first path segment = user id)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('user-content', 'user-content', false)
on conflict (id) do nothing;

drop policy if exists "user_content_select_own" on storage.objects;
create policy "user_content_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'user-content'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user_content_insert_own" on storage.objects;
create policy "user_content_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-content'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user_content_update_own" on storage.objects;
create policy "user_content_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'user-content'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-content'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user_content_delete_own" on storage.objects;
create policy "user_content_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-content'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
