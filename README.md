# TRINETRAAI — Guided Tour fix (patch carrier)

This repo carries the **verified fix for the guided tour** of the real project,
which lives at **[Himesh-rupchandani/TRINETRA-AI](https://github.com/Himesh-rupchandani/TRINETRA-AI)**
(the tour code is in `trinetra-ai/src/features/tour/`).
This session's GitHub token can only push to this repo, so the fix is delivered
here as a ready-to-apply patch.

## What was broken

| # | Defect | Effect |
|---|--------|--------|
| 1 | The tour never scrolled to the highlighted element | Steps deep in the page (federation modules, AI insights, alerts desk, GIS map, investigation demo, evidence vault) spotlighted elements **below the fold** — a floating card describing something invisible |
| 2 | The highlight was measured once and frozen | Entrance animations, async charts and alert toasts shifted the layout and left the highlight in the wrong place |
| 3 | Data-dependent targets were dropped after ~6s | Live camera / evidence vault steps showed a spotlight-less floating card; the trace step had **no target at all** while loading or on error |
| 4 | Route changes pushed history entries | Back after the tour replayed tour routes |
| 5 | Enter/←/→ captured globally | Typing in the Ctrl+K search moved the tour instead of the cursor |

## What the fix does

`Tour.tsx` now runs one `requestAnimationFrame` tracking loop per step that:

1. keeps querying the DOM until a data-driven target mounts (8s patience, then a clean centred-card fallback),
2. **scrolls the target into view** the moment it is found (centred, `prefers-reduced-motion` aware, clears the sticky header/nav),
3. **re-measures every frame**, so the spotlight follows layout shifts and scrolling instead of freezing,
4. pulls the target back if a late render pushes it off screen (throttled),
5. places the card from its real measured size, always clamped inside the viewport.

Tour navigation uses `replace()`; keyboard shortcuts ignore keystrokes typed in
form fields. `VehicleInvestigation.tsx` carries the `data-tour="trace"` hook in
every page state (loading, invalid plate, error, empty, success).

## How to apply it to TRINETRA-AI

From your local clone of **TRINETRA-AI**:

```bash
# option A — keep the full commit (message + authorship)
curl -sL https://github.com/Himesh-rupchandani/TRINETRAAI/raw/<branch>/guided-tour-fix.patch -o /tmp/tour.patch
git am /tmp/tour.patch

# option B — plain apply
git apply guided-tour-fix.diff
```

Or re-connect this Arena session to `TRINETRA-AI` and ask the agent to push the
branch `fix/guided-tour` (commit `cf9df65`) and open the PR — the work is done.

## Verification (all green)

- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors (one warning fewer than `main`)
- `npm test` — **59/59** (main was 47/48: 11 new tour tests + 1 stale contract needle updated)
- `npm run build` — production build succeeds
- **Real-browser E2E** (headless Chromium, 1280×800): all 13 steps walked —
  spotlight aligned to its target at **Δ = 0.0px** in every targeted step,
  every highlight on screen, no history spam, auto-start works for first-time
  visitors and stays quiet for returning ones.
  See `verification/tour-verification.json` and `verification/screenshots/`.

## Contents

- `guided-tour-fix.patch` / `.diff` — the fix as a git patch
- `tour-fix/` — the five changed files with their project paths
- `verification/` — E2E results and per-step screenshots
