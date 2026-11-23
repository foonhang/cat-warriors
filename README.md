# Cat Clan (貓族) — web prototype

**Version:** v0.7.0 (walk and talk; color comic originals; player color idle for all poses; no combat)

Kids ~7.5 story walk. Camp, Forest, and Creek. Tap friends to talk. Bug, Mouse, and Fox Cub are story characters only.

## Run
```bash
cd mao-zu-proto && python3 -m http.server 8765
# open http://localhost:8765
```

## Smoke
```bash
node smoke_test.mjs
```

## v0.7.0 locks
- Walk between Camp / Forest / Creek (screen edges)
- Tap a cat to play existing cutscenes (combat lines rewritten as short story)
- No turn combat, HP, or skills
- Player is the existing color comic Player (no custom creator; walk/atk/portrait share color idle)
- Companion (purple kitten) follows Kit
- Save key: `mao_zu_v07` (can continue from `mao_zu_v04` zone)

Pages: parent CloudAgent push — do not self-push.
