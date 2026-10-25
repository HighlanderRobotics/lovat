ALTER TABLE "RegisteredTeam"
  ADD COLUMN "customPostMatch" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD CONSTRAINT "RegisteredTeam_customPostMatch_max_three"
    CHECK (cardinality("customPostMatch") <= 3);

-- Keep the question wording with each answer so edits cannot relabel old data.
ALTER TABLE "ScoutReport"
  ADD COLUMN "customPostMatch" JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD CONSTRAINT "ScoutReport_customPostMatch_max_three"
    CHECK (jsonb_typeof("customPostMatch") = 'array' AND jsonb_array_length("customPostMatch") <= 3);
