-- ============================================================
-- Migration 0007: Hierarchical caching + zero-call fast path
-- ============================================================
-- Adds:
--   saved_plan_classes  — join table linking saved plans to cached course research
--   known_schedules     — pre-assembled payload cache keyed by schedule signature
--
-- After this migration, saved_plans.payload can be payload_version=2, which
-- stores only class_refs (course_cache_id + meetings + overrides) instead of
-- duplicating full logistics JSON. The server assembles the full payload via
-- GET /plans/{id}/expanded by joining course_research_cache.
-- ============================================================


-- ----------------------------------------------------------
-- Table: saved_plan_classes
-- ----------------------------------------------------------
-- Each row links one cached course to one saved plan.
-- The frontend writes one row per class when saving a v2 plan.
-- The server reads these rows when expanding a v2 plan.
-- ----------------------------------------------------------
create table if not exists public.saved_plan_classes (
    id                  uuid primary key default gen_random_uuid(),
    plan_id             uuid not null references public.saved_plans(id) on delete cascade,
    course_cache_id     uuid not null references public.course_research_cache(id) on delete restrict,
    course_code         text not null,
    professor_name      text,
    -- meetings stores the geocoded SectionMeeting[] array as JSON
    meetings            jsonb not null default '[]',
    -- overrides stores any user edits to logistics (e.g. renamed course title)
    overrides           jsonb not null default '{}',
    created_at          timestamptz not null default now()
);

comment on table public.saved_plan_classes is
    'Join table: one row per course per saved plan. course_cache_id references the canonical research cache entry.';

create index if not exists saved_plan_classes_plan_id_idx
    on public.saved_plan_classes (plan_id);

create index if not exists saved_plan_classes_cache_id_idx
    on public.saved_plan_classes (course_cache_id);


-- RLS: users may only see / modify saved_plan_classes rows that belong to
-- their own plans. We join through saved_plans to check user_id.
alter table public.saved_plan_classes enable row level security;

create policy "saved_plan_classes: owner select"
    on public.saved_plan_classes for select
    using (
        exists (
            select 1 from public.saved_plans sp
            where sp.id = saved_plan_classes.plan_id
              and sp.user_id = auth.uid()
        )
    );

create policy "saved_plan_classes: owner insert"
    on public.saved_plan_classes for insert
    with check (
        exists (
            select 1 from public.saved_plans sp
            where sp.id = saved_plan_classes.plan_id
              and sp.user_id = auth.uid()
        )
    );

create policy "saved_plan_classes: owner update"
    on public.saved_plan_classes for update
    using (
        exists (
            select 1 from public.saved_plans sp
            where sp.id = saved_plan_classes.plan_id
              and sp.user_id = auth.uid()
        )
    );

create policy "saved_plan_classes: owner delete"
    on public.saved_plan_classes for delete
    using (
        exists (
            select 1 from public.saved_plans sp
            where sp.id = saved_plan_classes.plan_id
              and sp.user_id = auth.uid()
        )
    );


-- ----------------------------------------------------------
-- Table: known_schedules
-- ----------------------------------------------------------
-- Keyed by schedule_signature (SHA-256 hex of sorted normalized course entries).
-- Stores a pre-assembled BatchResearchResponse payload so that an identical
-- schedule can be served with zero external calls.
-- plan_id is optional — records the last plan that triggered assembly.
-- ----------------------------------------------------------
create table if not exists public.known_schedules (
    signature           text primary key,
    plan_id             uuid references public.saved_plans(id) on delete set null,
    assembled_payload   jsonb not null,
    updated_at          timestamptz not null default now()
);

comment on table public.known_schedules is
    'Pre-assembled research payloads keyed by schedule signature (SHA-256). '
    'Allows zero-call fast path: same set of courses → skip all research.';

create index if not exists known_schedules_updated_at_idx
    on public.known_schedules (updated_at desc);

-- known_schedules is shared (no user ownership), so no RLS.
-- Reads are unrestricted; writes happen only from the backend service role.
-- If you want to lock this down further, restrict to service_role only.


-- ----------------------------------------------------------
-- Bump saved_plans: add class_refs column for v2 payload metadata
-- ----------------------------------------------------------
-- For v2 plans, payload can be minimal metadata + class_refs array.
-- class_refs: [{course_cache_id, meetings, overrides}]
-- This column is optional; it mirrors what's in saved_plan_classes for
-- fast re-assembly without a join when the data fits in the payload.
-- ----------------------------------------------------------
alter table public.saved_plans
    add column if not exists payload_class_refs jsonb;

comment on column public.saved_plans.payload_class_refs is
    'V2 plan class references: [{course_cache_id, course_code, professor_name, meetings, overrides}]. '
    'Null for v1 plans (full dossiers stored in payload column).';
