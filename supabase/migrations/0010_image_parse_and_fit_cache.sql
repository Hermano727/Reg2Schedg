-- Image parse cache: image content hash → ParseScreenshotResponse
-- Allows the backend to skip Gemini vision for exact duplicate image uploads.
CREATE TABLE IF NOT EXISTS image_parse_cache (
  image_hash   TEXT        PRIMARY KEY,
  parse_result JSONB       NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Store fit evaluation alongside existing research snapshot in known_schedules.
-- Populated after the first full research run; returned on fast-path hits so
-- the frontend can skip the /api/fit-analysis Gemini call entirely.
ALTER TABLE known_schedules
  ADD COLUMN IF NOT EXISTS fit_evaluation JSONB;
