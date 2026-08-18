-- Migration 038: per-character image-tag bank (Kazuma-style locked identity tags).
-- A curated, physical-only, comma/newline-separated tag string that becomes the
-- authoritative identity_tags for image generation (bridge/portrait/sprite),
-- overriding the on-the-fly derivation from visual_descriptors. Size vocabulary
-- is stripped at use time — the BE engine's tier stays the sole size authority.

ALTER TABLE characters ADD COLUMN image_tags TEXT DEFAULT NULL;
