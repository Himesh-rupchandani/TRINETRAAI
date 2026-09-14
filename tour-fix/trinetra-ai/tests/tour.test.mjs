/**
 * Guided walkthrough regression tests.
 *
 * The tour overlay used to measure its target once and never scroll, so any
 * step deep in the page (federation modules, alerts desk, GIS map, evidence
 * vault…) spotlighted an element below the fold: the card floated over a dark
 * backdrop describing something invisible. These contracts pin the fix.
 */
import {
  excludes,
  includes,
  loadTs,
  notOk,
  ok,
  readSource,
  suite,
  test,
} from './harness.mjs';

/* ----------------------- source contracts: Tour.tsx ----------------------- */

suite('guided tour — the spotlight stays on screen and on target');

const tour = readSource('trinetra-ai/src/features/tour/Tour.tsx');

test('a step scrolls its target into view before spotlighting it', () => {
  includes(tour, 'scrollTargetIntoView', 'without scrolling, below-the-fold steps highlight invisible elements');
  includes(tour, "block: 'center'", 'centering keeps the target clear of the sticky header and nav');
});

test('the spotlight keeps re-measuring every frame instead of freezing', () => {
  includes(tour, 'requestAnimationFrame', 'a one-shot measurement goes stale when charts, toasts and animations shift the layout');
  includes(tour, 'isOnScreen', 'already-visible targets must not trigger a disorienting scroll');
});

test('the card is placed from its real measured size, clamped to the viewport', () => {
  includes(tour, 'positionCard(card, rect)');
  excludes(tour, 'CARD_H_EST', 'a hard-coded card-height estimate drifts and lets the card overflow the screen');
});

test('late-mounted targets (live camera, evidence vault) are waited for, not dropped', () => {
  includes(tour, 'GIVE_UP_MS');
  includes(tour, 'QUERY_EVERY_MS');
});

test('tour navigation replaces history instead of spamming the Back button', () => {
  includes(tour, 'navigate(step.route, { replace: true })');
});

test('keyboard shortcuts are ignored while the user types in a field', () => {
  includes(tour, 'isTypingTarget(e.target)');
});

test('the spotlight and card carry stable hooks for UI tests', () => {
  includes(tour, 'data-tour-spotlight');
  includes(tour, 'data-tour-card');
});

/* ----------------- source contracts: VehicleInvestigation ---------------- */

suite('guided tour — the trace step has a target in every page state');

const investigation = readSource('trinetra-ai/src/pages/VehicleInvestigation.tsx');

test('loading, invalid-plate, error, empty and success states all carry the trace target', () => {
  const hits = investigation.split('data-tour="trace"').length - 1;
  ok(hits >= 5, `expected the trace target in every page state, found ${hits}`);
});

/* ----------------------- executed: tourStore.ts -------------------------- */

suite('guided tour — store navigation');

const { tourStore } = loadTs('src/features/tour/tourStore.ts', {
  react: { useSyncExternalStore: () => ({ open: false, i: 0 }) },
});

test('start() opens at the requested step', () => {
  tourStore.start(3);
  const s = tourStore.get();
  ok(s.open, 'the tour should be open');
  ok(s.i === 3, `expected step 3, got ${s.i}`);
});

test('next() advances and stops cleanly at the end of the last step', () => {
  tourStore.start(0);
  tourStore.next(2);
  ok(tourStore.get().i === 1, 'next() should advance one step');
  tourStore.next(2);
  notOk(tourStore.get().open, 'next() on the final step should close the tour');
});

test('prev() never runs below the first step', () => {
  tourStore.start(0);
  tourStore.prev();
  ok(tourStore.get().i === 0, 'prev() at step 0 must stay at 0');
});
