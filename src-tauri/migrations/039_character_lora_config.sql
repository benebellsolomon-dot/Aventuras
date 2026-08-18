-- Migration 039: per-character LoRA binding for image generation. Stores a JSON
-- CharacterLoraConfig (name, triggerWords, baseWeight, tierScale, maxWeight).
-- Trigger words are injected into image prompts (provider-agnostic); name +
-- tier-scaled weight feed a LoRA-capable provider (ComfyUI). NULL = no binding.

ALTER TABLE characters ADD COLUMN lora_config TEXT DEFAULT NULL;
