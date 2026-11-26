# SetbackLab — Setback Law Simulator (PWA)

Interactive 3D / 2D simulator for the Thai Building Control Act (พ.ร.บ. ควบคุมอาคาร) and
Ministerial Regulation No. 55 (กฎกระทรวง ฉบับที่ 55). Rebuilt from the single-file
`archstudio_pro_ui_ux.html` prototype into a modular, testable web app.

## Run it

```bash
# any static server works; service workers need http(s) or localhost
python3 -m http.server 8080
# open http://localhost:8080
```

Tests (Node 18+, no dependencies):

```bash
node --test test/law.test.js
```

## Structure

```
index.html            App shell (markup, bilingual labels via data-i18n)
css/styles.css        Styles (no framework; works offline once cached)
js/law.js             Legal engine — pure functions, no DOM. Testable in Node.
js/i18n.js            TH / EN UI strings
js/plan2d.js          2D plan renderer (canvas)
js/scene3d.js         3D scene (Three.js r128) with built-in orbit control
js/app.js             Controller: state, form binding, rule cards, view switching
sw.js                 Service worker — caches the app shell
manifest.webmanifest  Installable PWA manifest
test/law.test.js      Engine unit tests
```

## How the engine works

`ArchLaw.evaluate(state, lang)` takes a plain project state and returns:

- `isAllValid` — overall pass/fail
- `rules[]` — five (six for row buildings) cards, each with `pass`, `current`, `required`, `desc`
- `metrics` — footprint, OSR %, FAR, floors, gaps
- `required` — the minimum setbacks used to draw the dashed legal lines
- `geometry` — footprint polygon for straight / L / U shapes

Helpers:

- `fitBuildingToLegal(state)` → patch that makes the building pass
- `centerBuilding(state)` → patch that centres it on the lot
- `applyCategoryPreset(state, category)` → case-study preset (house / townhome / shophouse / condo)

The engine is a direct port of the original `evaluateBuildingLaw()`. Rule thresholds are
unchanged; the tests in `test/law.test.js` pin the default case and the main failure modes.

## Status vs. the original prototype

| Feature | Status |
|---|---|
| Bilingual TH / EN | ✅ rule text and UI labels |
| Four case-study presets | ✅ each starts from clean defaults |
| Setback rules 1–5 + row rule 6 | ✅ same thresholds as original |
| Glass-block / zero-lot wall conditions | ✅ engine + UI fields |
| Fit to legal / centre building | ✅ |
| 3D model (straight / L / U) | ✅ with required-setback outline |
| 2D plan with dimensions | ✅ |
| Installable / offline shell | ✅ PWA manifest + service worker |
| Acoustic page (noise map, wall-section sim) | ⏳ not yet ported |
| Google Maps / satellite context scan | ⏳ not yet ported |
| Intro / onboarding modal | ⏳ not yet ported |

## Known limitations

- Three.js loads from a CDN. Without network access the 3D panel shows a message; 2D and rules still work.
- Rule text is educational. It is not legal advice; the footer says so.
- Building height is modelled as a single extrusion. There is no roof geometry yet.

## Suggested next steps

1. Port the acoustic page as `js/acoustic.js` (the original logic is at `updateAcousticSimulator()`).
2. Add a `geo.js` module for the map context, keeping the scan service behind one function so the API key and rate limits live in one place.
3. Add an icon set (`icons/`) and list it in `manifest.webmanifest` for install prompts.

## Features added after the port

- Roof types (gable / hip / flat slab / shed) with show/hide, and a main-building toggle
- Main road on the front plus secondary roads on the left / right / rear, each with its own width
- Lot orientation (N/E/S/W) and building layout bearing, with north arrows in 3D and 2D
- Editable context: neighbours, buildings across the road and street trees (add / remove / move)
- Site analysis: sun path (time + season, drives the 3D shadow), wind rose, traffic-noise heat map (dB)
- Soft sun shadows, sky gradient, fill light and contact shadows in 3D

Notes: Three.js is loaded from the cdnjs CDN. The wind rose and noise levels are illustrative
models (line-source road noise, no shielding), not measured data.

## Deploy on GitHub Pages

Push to a repo, then Settings -> Pages -> Deploy from branch -> `main` / root. `.nojekyll` is included.
