# alpha52 → Ambrosia panel-depth inventory (2026-06-12)

Produced for UI-P4/P5 design (Ben's live-test feedback: "what I'm looking at is the mechanical depth
the BE-script had"). Source: `reference/BE   Breast Expansion v2 0 0-alpha52.naiscript` UI code vs
Ambrosia v0.4.5 `buildPanel` + the `[BE]` body lorebook entries. Method: full enumeration of every
field/gauge/affordance alpha52 displayed, agent-compiled, spot-checked against the live v0.4.5 panel.

## Field-by-field comparison

| Field / Affordance | alpha52 Panel | Ambrosia Panel | Ambrosia Lorebook Entry (`[BE]` body) | Gap? |
|---|---|---|---|---|
| **PER-CHARACTER BODY — CORE** | | | | |
| Cup letter (tier) | ✓ — large badge, tier-colored, monospace | ✓ — bold letter, muted gold | ✓ — tier letter + tier index | no |
| Tier index (numeric) | ✓ — shown in What-If and Details monospace | ✗ | ✓ — "tier N" | partial |
| Bust circumference (cm) | ✓ — 1.1em primary display, inline with projection | ✗ | ✓ — "Xcm bust" | **YES** |
| Bust projection (cm) | ✓ — primary measurement row, "Xcm forward" | ✗ | ✗ | **YES** |
| Weight per side (kg) | ✓ — primary measurement row, "/side" | ✗ | ✗ | **YES** |
| Total breast tissue weight (kg) | ✓ — context line, also in details monospace row | ✗ | ✓ — "Xkg breast tissue" | **YES (panel)** |
| Total carry weight with milk (kg) | ✓ — lactation row + details row | ✗ | ✗ | **YES** |
| Breast mass as % of body weight | ✓ — context line + red mass bar (at ≥15%) | ✗ | ✓ — "Proportion: …" line | **YES (panel)** |
| Comparative size description | ✓ — in What-If simulator preview | ✗ | ✓ — snap.comparative_description | **YES (panel face)** |
| Waist / Hips (cm) | ✓ — Details > BWH row (monospace) | ✗ | ✗ | **YES** |
| Height (cm) | ✓ — identity chip line, also editable | ✗ | ✗ | **YES** |
| Build | ✓ — identity chip; editable via in-panel selector | ✗ | ✗ | **YES** |
| Race/heritage | ✓ — identity chip | ✗ | ✗ | **YES** |
| **PER-CHARACTER BODY — SHAPE & FEEL** | | | | |
| Breast shape (natural/firm/gravity-defying) | ✓ — chip + in-panel toggle buttons | ✗ | ✓ — snap.shape_descriptor + droopRef | **YES (panel)** |
| Droop / ptosis | ✗ (computed but not displayed as named field) | ✗ | ✓ — droopRef sentence | partial |
| Cleavage depth/label | ✓ — chip + full pip-bar scale in Details | ✗ | ✗ | **YES** |
| Bounce amplitude/label | ✓ — chip + full pip-bar scale in Details | ✗ | ✗ | **YES** |
| Base width (cm) | ✗ | ✗ | ✓ — "Span: …" | only in lorebook |
| Areola diameter (cm) | ✗ | ✗ | ✓ — "Detail: …" | only in lorebook |
| **PER-CHARACTER BODY — FUNCTIONAL STATE** | | | | |
| Posture label | ✓ — state chip (genre-translated) | ✗ | ✓ — "Posture: …" | **YES (panel)** |
| Mobility label | ✓ — state chip (genre-translated) | ✗ | ✓ — "mobility: …" | **YES (panel)** |
| Clothing/fit label | ✓ — warning line, genre-translated | ✗ | ✗ | **YES** |
| Sensitivity label | ✓ — state chip (only when non-normal) | ✗ | ✗ | **YES** |
| Skin tension label | ✓ — state chip (only when non-normal) | ✗ | ✗ | **YES** |
| **PER-CHARACTER SOCIAL / RELATIONSHIP** | | | | |
| Relationship to protagonist (text) | ✓ — card face (first sentence) + full in Details | ✗ | ✗ | **YES** |
| Relationship stage (stranger…bonded) | ✓ — colored stage label + pip progress dots | ✓ — one-liner italic below name | ✗ | partial |
| Relationship stage progress (pip counter) | ✓ — ●●○ pips | ✗ | ✗ | **YES** |
| Transformation attitude | ✓ — genre-label on card face; editable in Editor | ✓ — one-liner italic (raw key) | ✗ | partial |
| Consent mode (derived + override) | ✓ — chip on card face; full override selector in Details | ✓ — chip (derived only, no override) | ✗ | **YES (override UI)** |
| **PER-CHARACTER GROWTH TRACKING** | | | | |
| Baseline tier / cup letter | ✓ — shown in tier strip, timeline summary line | ✗ | ✗ | **YES** |
| Growth delta from baseline (tiers) | ✓ — tier strip shows colored "bestowed" segment | ✗ | ✗ | **YES** |
| Last growth event summary | ✓ — "↑ X→Y-cup, cause" + kg/side delta | ✗ | ✗ | **YES** |
| Recent growth delta (this chapter) | ✗ (tracked but not labeled) | ✓ — "▲ +N tiers this chapter" chip | ✗ | no |
| Growth trajectory label (accelerating/steady/plateau/decelerating) | ✓ — trajectory arrow in timeline summary | ✗ | ✗ | **YES** |
| Full growth timeline (per-event history) | ✓ — collapsible vertical timeline, tap to expand | ✗ | ✗ | **YES** |
| Next milestone preview (kg until…) | ✓ — "❤ N kg until [description]" | ✗ | ✓ — "Approaching: …" (near-gated) | **YES (panel)** |
| Transformation phase (idle/anticipating/growing/settling) | ✓ — phase tag badge; pending-growth banner with Clear | ✗ | ✗ | **YES** |
| **PER-CHARACTER LACTATION** | | | | |
| Lactation active state | ✓ — separate lactation block | ✓ — milk bottle gauge (if active) | ✓ — "Lactating — N% full" | no |
| Fill percent | ✓ — labeled bar + % number + mood phrase | ✓ — bottle gauge + % number | ✓ — fill% in lorebook | no |
| Milk weight carried (kg) | ✓ — "carrying Xkg" | ✗ | ✗ | **YES** |
| Capacity (ml/side) | ✓ — "capacity Xml/side" | ✗ | ✓ — "Xml capacity" (total) | **YES (panel)** |
| Bounce quality modifier (lactation) | ✓ — appended to lactation row | ✗ | ✗ | **YES** |
| Lactation predisposition | ✓ — trait chip ("dormant milk potential" etc.) | ✗ | ✗ | **YES** |
| **PER-CHARACTER SYSTEMS & TRAITS** | | | | |
| Catalyst susceptibility | ✓ — trait chip (responds normally/eagerly/resists) | ✗ | ✗ | **YES** |
| Harem membership toggle | ✓ — "◉ harem" toggle button per card | ✗ | ✗ | **YES** |
| Harem rank within roster | ✓ — "Nth of N" label | ✗ | ✗ | **YES** |
| Wardrobe / outfit tracking | ✓ — current outfit with fit status + full wardrobe list with wear/remove; preset add + custom add + refit buttons | ✗ | ✗ | **YES** |
| World reactions / consequence cascades | ✓ — labeled list with decay counter + dismiss button | ✗ | ✗ | **YES** |
| Body language behavior | ✓ — italic prose line (enabled by config) | ✗ | ✗ | **YES** |
| Sensory profile (Touch/Weight/Sound/Temp/Visual) | ✓ — 5-row labeled display | ✗ | ✗ | **YES** |
| Emotional arc journal | ✓ — collapsible, per-entry with trigger type + generation stamp + delete; Manual Record button | ✗ | ✗ | **YES** |
| Visual snapshot / presence quote | ✓ — large italic quote block "✧ presence" | ✗ | ✗ | **YES** |
| **HAREM SUMMARY (global)** | | | | |
| Total harem count + tracked count | ✓ — "Your harem — N women (M tracked)" | ✗ (member count in ribbon only) | ✗ | **YES** |
| Total growth bestowed (all characters, half-cups) | ✓ — summary line | ✗ | ✗ | **YES** |
| Largest character + cup | ✓ — "largest: Name (X-cup)" | ✗ | ✗ | **YES** |
| Total breast weight (all harem, kg) | ✓ — "total breast weight: Xkg" | ✗ | ✗ | **YES** |
| Size rankings (collapsible) | ✓ — 🥇🥈🥉 ranked list, expandable | ✗ | ✗ | **YES** |
| Rivalry pairs (tied/gap display) | ✓ — ⚔ rivalry lines in rankings | ✗ | ✗ | **YES** |
| Most-attended (favor leader) | ✓ — "♥ most attended: Name" | ✗ | ✗ | **YES** |
| **GROWTH MECHANISMS** | | | | |
| Active mechanisms list | ✓ — named list with ✕ remove each | ✗ | ✗ | **YES** |
| SE candidate entries to tag as mechanism | ✓ — "+ Entry" buttons for candidates | ✗ | ✗ | **YES** |
| **INCONSISTENCY FLAGS** | | | | |
| Active inconsistency flags | ✓ — flagged quote + ✓Accept / ✗Reject / Dismiss | ✗ | ✗ | **YES** |
| **PROTAGONIST / SHEET TAB** | | | | |
| Protagonist name + genre title | ✓ — name + "Ascendant Catalyst — [desc]" | ✓ — name + Catalysis statRow + Potency statRow | ✗ | partial |
| Catalyst potency (0–10) + bar | ✓ — labeled bar + potency growth desc | ✓ — statRow (number only) | ✗ | partial |
| Catalyst strain (0–100) + bar | ✓ — labeled bar + flavor text (when enabled) | ✗ | ✗ | **YES** |
| Skills (all 8) with rank + bar + label + advancement marks | ✓ — PRIMARY (catalysis, seduction) with inline desc; SUPPORTING (6 skills) compact rows | ✗ | ✗ | **YES** |
| Advancement pip counter (successes until next check) | ✓ — "N successes from your next advancement" + 5 pips | ✗ | ✗ | **YES** |
| Active effects (timed buffs/debuffs with gens remaining) | ✓ — prominent amber cards | ✗ | ✗ | **YES** |
| Growth bestowed per-partner trophy section | ✓ — +N tiers · N events · now X-cup, per woman | ✗ | ✗ | **YES** |
| Recent rolls (last 8, narrative + detail) | ✓ — collapsible section on Sheet tab | ✗ | ✗ | **YES** |
| Advancement history | ✓ — collapsible, last 10 events | ✗ | ✗ | **YES** |
| **ALEMBIC / PRESSURE** | | | | |
| Growth pressure readout | ✗ | ✓ — "⚗ The Alembic" — always-visible strip, cell gauge, cresting crest | ✗ | no (Ambrosia unique) |
| **WORLD TAB / WORLD SECTION** | | | | |
| Current location name | ✗ | ✓ — "⌂ Location" | ✗ | no (Ambrosia unique) |
| Active quests | ✗ | ✓ — "✠ quest1 · quest2" | ✗ | no (Ambrosia unique) |
| Travel planks (adjacent locations) | ✗ | ✓ — parchButton per connection | ✗ | no (Ambrosia unique) |
| Quest branch pickers (archetype quests) | ✗ | ✓ — waxButton per branch option | ✗ | no (Ambrosia unique) |
| **SETTINGS TAB** | | | | |
| All 20+ config toggles | ✓ — dedicated Settings tab with toggle rows + cadence steppers | ✗ (NAI config screen only) | ✗ | **YES** |
| SE detection / sync status | ✓ — ✓/✗ badge in header | ✓ — "● SE: N tracked" + ↻ Sync button | ✗ | no |
| Generation / character / roll stats | ✓ — summary line in Sheet tab | ✗ | ✗ | **YES** |
| **CAMERA OBSCURA (image bridge)** | | | | |
| Last rendered still / clip / 📷 🎬 buttons | ✗ | ✓ | ✗ | no (Ambrosia unique) |
| **SCRIPT PANEL (Judge result UI)** | | | | |
| Outcome headline · target portrait · growth arrow viz · outfit impact · secondary skill cascade · advancement celebration · attitude shift bar · stage advance pips · contested roll · strain indicator · dice detail (collapsible) · directive lens label · directive excerpt (collapsible) · generation stamp · ready/cooldown status · pacing streak alert · quick-jump buttons | ✓ — all of it, in scriptPanel | ✗ (toasts only) | ✗ | **YES — this is the UI-P4 "Judge/Oracle event cards" scope** |
| **STORY DECORATION (arc markers)** | | | | |
| Per-paragraph event marker (10 types, colored border) + node badge widget, persisted | ✓ | ✗ | ✗ | **YES** |

## Top 15 highest-value missing fields (ranked for mid-story play)

1. **Per-character measurements row** — bust cm, projection cm, kg/side, mass % of body (panel-invisible; tier letter only).
2. **Growth timeline** — collapsible per-event history (X→Y-cup, cause, gen); growth_history is tracked but never surfaced.
3. **Transformation phase / pending-growth banner** — anticipating/growing/settling badge + from→to preview + Clear.
4. **Growth trajectory label** — accelerating/steady/decelerating/plateau arrow (one token, huge pacing value).
5. **Protagonist skills panel** — all 8 skills with rank/bar/advancement marks + the successes-to-advancement pips.
6. **Sensory profile** — the Touch/Weight/Sound/Temp/Visual 5-row register display.
7. **Emotional arc journal** — per-character memory log (trigger, gen stamp, text).
8. **Catalyst susceptibility chip** — responds normally/eagerly/resists, at a glance per member.
9. **Wardrobe / outfit tracking** — current outfit + fit status (intact/straining/destroyed) + fitted-max cup.
10. **Harem summary metrics** — total bestowed, largest, total breast weight, 🥇 rankings + rivalries + favor leader.
11. **World reactions / consequence cascades** — active reactions with decay counters + dismiss.
12. **Next milestone preview** — un-gated "N kg until [description]" on the card face.
13. **Inconsistency-flag resolution UI** — ✓Accept / ✗Reject / Dismiss for cup-drift flags.
14. **Last growth event summary line** — "↑ C→D-cup, catalytic · +0.3kg/side."
15. **Catalyst strain bar** — the 0–100 resource cost when enabled.

## alpha52 interactive affordances Ambrosia lacks

Manual tier ± per card · in-panel character editor (height/waist/hips/build/susceptibility/attitude/
relationship) · What-If tier simulator (preview + Apply) · breast-shape 3-button toggle · consent-mode
override radio row · harem membership toggle · wardrobe management (presets/custom/wear/refit/remove) ·
"📝 Record Memory" (GLM journal) · "👁 Snapshot" (GLM presence quote) · "📊 History" toast ·
per-character "🔄 Refresh" · "🔮 Re-augment" (GLM re-derive) · "✨ Refresh desc" · "✕ Remove"
(destructive) · growth-mechanism tag/untag for SE entries · inconsistency Accept/Reject/Dismiss ·
full Settings tab (20+ toggles, cadence steppers) · the entire Judge scriptPanel suite · story
paragraph event markers (10 types, persisted).

## Notes for UI-P4/P5 scoping

- Ambrosia's unique surfaces (Alembic pressure strip, world/travel/quests, Camera Obscura) have no
  alpha52 counterpart — keep them.
- The Judge scriptPanel block maps 1:1 onto **UI-P4** ("Judge/Oracle event cards", blocked on §v Q4).
- Much of the per-character depth (measurements, posture/mobility, milestone, proportion) ALREADY
  EXISTS in `compute_body_snapshot`/the lorebook prose — panel work is presentation, not new engine
  state. The genuinely engine-missing systems are: sensory profile (matrix exists; display doesn't),
  emotional journal, wardrobe, consequence cascades, catalyst strain, skill advancement, trajectory
  label, what-if simulator.
- A NAI sidebar cannot hold all of this at once — alpha52 used tabs + collapsibles; the Gilded-Tome
  equivalent is per-card collapsible "Details" leaves + a Sheet drawer. Priority order = the ranked
  list above, gated by Ben's §v answers.
