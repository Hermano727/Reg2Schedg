-- Migration: add course_locations table for geocoded building/location cache

CREATE TABLE IF NOT EXISTS public.course_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_location TEXT NOT NULL,
  display_name TEXT,
  building_code TEXT,
  provider TEXT NOT NULL DEFAULT 'static',
  provider_place_id TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geocode_status TEXT NOT NULL DEFAULT 'resolved',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT course_locations_normalized_location_key UNIQUE (normalized_location)
);

CREATE INDEX IF NOT EXISTS course_locations_normalized_idx
  ON public.course_locations (normalized_location);

-- No RLS needed — this is a shared public cache (no user-owned data)
ALTER TABLE public.course_locations ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated and anonymous reads (shared cache)
CREATE POLICY "Allow public read" ON public.course_locations
  FOR SELECT USING (true);

-- Allow service role to write (backend only)
CREATE POLICY "Allow service write" ON public.course_locations
  FOR ALL USING (auth.role() = 'service_role');
