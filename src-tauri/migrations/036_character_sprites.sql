-- Migration 036: BE sprite engine (Spec 4 V2a) — banded per-character sprite cache
-- + the dedicated approved anchor render columns on characters.

CREATE TABLE IF NOT EXISTS character_sprites (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    appearance_hash TEXT NOT NULL,     -- spriteAppearanceHash: identity-stable inputs only
    band_index INTEGER NOT NULL,       -- 0..6 over the 7 size bands
    expression TEXT NOT NULL,          -- 'positive' | 'neutral' | 'distressed' | 'flushed'
    engorged INTEGER NOT NULL DEFAULT 0,
    image_data TEXT NOT NULL DEFAULT '', -- matted sprite data URL (webp/png base64)
    seed INTEGER,                      -- deterministic per-set seed (retry replay)
    status TEXT NOT NULL DEFAULT 'pending', -- pending|generating|complete|failed
    error_message TEXT,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    UNIQUE (character_id, appearance_hash, band_index, expression, engorged)
);

CREATE INDEX IF NOT EXISTS idx_sprites_char_hash ON character_sprites(character_id, appearance_hash);
CREATE INDEX IF NOT EXISTS idx_sprites_story ON character_sprites(story_id);
CREATE INDEX IF NOT EXISTS idx_sprites_status ON character_sprites(status);

-- Dedicated approved anchor render (raw/un-matted; the FaceID/pose source) —
-- mirrors the characters.portrait data-URL column pattern.
ALTER TABLE characters ADD COLUMN sprite_anchor TEXT DEFAULT NULL;
ALTER TABLE characters ADD COLUMN sprite_anchor_status TEXT DEFAULT NULL;
ALTER TABLE characters ADD COLUMN sprite_anchor_hash TEXT DEFAULT NULL;
