#!/usr/bin/env python3
"""D5 knob probe (research/63): read-only evidence pull from the live Aventuras DB.

Copies the DB to a temp dir first (never opens the live file), then reports, per
recent story, the rates the D5 knobs govern: DC-chip tagging rate, checks rolled
and their bands, chekhov loads/resolutions + the live bullet state, bond/sparks
trajectory per girl, arousal samples at/over the world-sim suppression gate,
GM-notebook size, titles. Usage: python3 research/_d5_knobs_probe.py [--stories N]
"""
import json, os, re, shutil, sqlite3, sys, tempfile
from collections import Counter, defaultdict

LIVE = os.path.expanduser('~/Library/Application Support/com.karelian.aventura/aventura.db')
SUPPRESS_AROUSAL = 70  # worldsim/constants.ts WORLDSIM_SUPPRESS_AROUSAL

def main():
    n = int(sys.argv[sys.argv.index('--stories') + 1]) if '--stories' in sys.argv else 2
    tmp = tempfile.mkdtemp(prefix='d5probe-')
    db_path = os.path.join(tmp, 'av.db')
    shutil.copy(LIVE, db_path)
    wal = LIVE + '-wal'
    if os.path.exists(wal):
        shutil.copy(wal, db_path + '-wal')
    db = sqlite3.connect(db_path)
    stories = db.execute(
        'select id, title, settings from stories order by updated_at desc limit ?', (n,)
    ).fetchall()
    for sid, title, settings in stories:
        st = json.loads(settings or '{}')
        print(f'\n=== {title} ({sid[:8]}) — beMode={st.get("beMode")} chekhov={st.get("chekhovGun")} '
              f'worldSim={st.get("worldSimFrequency")} agenda={st.get("npcAgenda")} '
              f'notebook={st.get("gmNotebook")} thoughts={st.get("npcThoughts")} titles={st.get("rpgTitles")} '
              f'tagging={st.get("rpgCheckTaggingRate", "sparing")}')
        report_story(db, sid)
    shutil.rmtree(tmp, ignore_errors=True)

def report_story(db, sid):
    rows = db.execute(
        'select position, type, world_state_delta, suggested_actions from story_entries '
        'where story_id=? order by position', (sid,)).fetchall()
    choices = tagged = tracked = checks = loads = resolved = 0
    bands = Counter(); dcs = Counter()
    bond_notes = defaultdict(list); arousal = []
    for pos, typ, wsd, sa in rows:
        if sa:
            try:
                acts = json.loads(sa)
                choices += len(acts); tagged += sum(1 for a in acts if a.get('skill'))
                dcs.update(a.get('dc') if a.get('dc') is not None else 'none' for a in acts if a.get('skill'))
            except json.JSONDecodeError:
                pass
        if not wsd:
            continue
        d = json.loads(wsd); tracked += 1
        for c in d.get('checkLog', []):
            checks += 1; bands[c.get('band')] += 1
        cr = d.get('classificationResult') or {}
        loads += len(cr.get('narrativeDebt') or []); resolved += len(cr.get('resolvedDebts') or [])
        for r in d.get('beLog', []):
            if r.get('kind') == 'bond':
                bond_notes[r['character']].append((pos, r.get('note', '')))
            if r.get('kind') == 'mood':
                m = re.search(r'arousal→(\d+)', r.get('note', ''))
                if m: arousal.append(int(m.group(1)))
    print(f'tracked turns {tracked} | choices {choices}, tagged {tagged} '
          f'({tagged / choices:.0%} — dc spread {dict(sorted(dcs.items(), key=lambda kv: str(kv[0])))}) | checks rolled {checks} {dict(bands)}'
          if choices else f'tracked turns {tracked} | no choices stored')
    print(f'chekhov: loads proposed {loads}, resolutions proposed {resolved} '
          f'({resolved / max(1, loads):.0%} of loads — a high ratio = the classifier resolves liberally)')
    if arousal:
        hi = sum(1 for a in arousal if a >= SUPPRESS_AROUSAL)
        print(f'arousal samples {len(arousal)}, at/over {SUPPRESS_AROUSAL} (world-sim suppressed): {hi} ({hi / len(arousal):.0%}); last {arousal[-5:]}')
    for name, notes in bond_notes.items():
        bumps = [p for p, n in notes if 'bond +1' in n]; drops = [p for p, n in notes if 'bond -1' in n or 'bond −1' in n]
        print(f'rel[{name}]: {len(notes)} interaction turns, bond +1 at turns {bumps}, -1 at {drops}; last: {notes[-1][1]}')
    for name, rel, meta in db.execute(
            "select name, json_extract(metadata,'$.bodyState.rel'), metadata from characters "
            "where story_id=? and relationship!='self' and json_extract(metadata,'$.bodyState') is not null", (sid,)):
        print(f'  now[{name}]: rel {rel}')
    self_meta = db.execute("select metadata from characters where story_id=? and relationship='self'", (sid,)).fetchone()
    if self_meta and self_meta[0]:
        m = json.loads(self_meta[0])
        ck = m.get('chekhovState') or {}
        print(f'chekhov state: {len(ck.get("bullets", []))} bullets, nextId {ck.get("nextId")}, cooldown {ck.get("cooldown")}: '
              + '; '.join(f"{b['id']} w{b.get('weight')} age{b.get('age')} fires{b.get('fires', 0)}{' LOCKED' if b.get('lock') else ''}" for b in ck.get('bullets', [])))
        nb = m.get('gmNotebook') or {}
        print(f'notebook: {len(nb.get("notes", []))} notes; titles: {[t.get("name") for t in (m.get("rpgSheet") or {}).get("titles", [])]}')

if __name__ == '__main__':
    main()
