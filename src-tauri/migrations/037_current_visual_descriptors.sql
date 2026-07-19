-- Migration 037: two-layer appearance (Ben's ruling 2026-07-19) — the
-- story-tracked "current look" the classifier updates each turn, kept SEPARATE
-- from visual_descriptors (the canonical baseline that identity rendering and
-- the sprite appearance hash consume).

ALTER TABLE characters ADD COLUMN current_visual_descriptors TEXT DEFAULT NULL;
