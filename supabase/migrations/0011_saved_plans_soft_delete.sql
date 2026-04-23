-- Soft-delete support for saved_plans.
-- Instead of hard-deleting rows, client code sets is_deleted = true.
-- RLS select/update policies are updated to filter out deleted rows automatically.

alter table public.saved_plans
  add column if not exists is_deleted boolean not null default false;

-- Re-create select policy to hide soft-deleted rows from all queries
drop policy if exists "saved_plans_select_own" on public.saved_plans;
create policy "saved_plans_select_own"
  on public.saved_plans for select
  to authenticated
  using (user_id = auth.uid() and is_deleted = false);

-- Update policy unchanged (users can still update their own rows, including setting is_deleted=true)
drop policy if exists "saved_plans_update_own" on public.saved_plans;
create policy "saved_plans_update_own"
  on public.saved_plans for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
