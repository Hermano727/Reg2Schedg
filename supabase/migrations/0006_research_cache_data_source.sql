-- Add data_source column to course_research_cache to track which pipeline tier
-- populated each row: tiered_pipeline | browser_use | prepopulate_job
alter table public.course_research_cache
  add column if not exists data_source text not null default 'browser_use';

comment on column public.course_research_cache.data_source is
  'Which pipeline tier populated this row: tiered_pipeline | browser_use | prepopulate_job';

create index if not exists course_research_cache_data_source_idx
  on public.course_research_cache (data_source);
