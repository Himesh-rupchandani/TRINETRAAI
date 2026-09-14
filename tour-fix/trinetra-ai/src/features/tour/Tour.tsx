import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Shield, X } from 'lucide-react';
import { TOUR_STEPS } from './tourSteps';
import { tourStore, useTour } from './tourStore';
import { cn } from '@/lib/utils';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 16; // spotlight → card distance
const PAD = 8; // spotlight padding around the target
const EDGE = 12; // minimum distance from any viewport edge
const MIN_SIZE = 24; // smaller than this in BOTH axes means "not mounted yet"
const GIVE_UP_MS = 8_000; // how long to wait for a late, data-driven target
const QUERY_EVERY_MS = 80; // DOM re-query cadence while the target is missing
const MOVE_EPS = 0.5; // px a rect must move before styles are rewritten
/** Sticky header (h-14) + primary nav — targets must clear this much chrome. */
const STICKY_SAFE = 110;

type Phase = 'acquiring' | 'ready' | 'fallback';

/** True when a keystroke belongs to a field the user is typing in. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/** Bring the spotlighted element on screen — the core of the tour fix. */
function scrollTargetIntoView(el: Element) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  try {
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
  } catch {
    el.scrollIntoView();
  }
}

/** Is the rect visible enough that we should NOT disturb the scroll position? */
function isOnScreen(r: Rect, vh: number): boolean {
  const top = r.y;
  const bottom = r.y + r.h;
  // Taller than the viewport: only jump when it is completely out of view.
  if (r.h >= vh - STICKY_SAFE - EDGE) return bottom > 0 && top < vh;
  return top >= STICKY_SAFE && bottom <= vh - EDGE;
}

function writeIfChanged(el: HTMLElement, prop: string, value: string) {
  if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
}

/**
 * Place the card near the spotlight (or centred when there is none), always
 * fully inside the viewport. Runs every frame, so the real card size is used
 * instead of a hard-coded height estimate.
 */
function positionCard(card: HTMLElement, r: Rect | null) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  let left: number;
  let top: number;
  if (!r) {
    left = (vw - cw) / 2;
    top = (vh - ch) / 2;
  } else {
    const fitsBelow = r.y + r.h + GAP + ch <= vh - EDGE;
    top = fitsBelow ? r.y + r.h + GAP : Math.max(EDGE, Math.min(r.y - GAP - ch, vh - ch - EDGE));
    left = r.x + r.w / 2 - cw / 2;
  }
  left = Math.max(EDGE, Math.min(left, vw - cw - EDGE));
  top = Math.max(EDGE, Math.min(top, vh - ch - EDGE));
  writeIfChanged(card, 'left', `${Math.round(left)}px`);
  writeIfChanged(card, 'top', `${Math.round(top)}px`);
}

export function Tour() {
  const { open, i } = useTour();
  const step = TOUR_STEPS[i];
  const total = TOUR_STEPS.length;
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<Phase>('acquiring');
  const firedActions = useRef<Set<string>>(new Set());
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // A fresh session every time the walkthrough opens.
  useEffect(() => {
    if (open) firedActions.current.clear();
  }, [open]);

  // Route the page to the step — replace, never push, so the tour leaves no
  // trail of history entries for the browser Back button to replay.
  useEffect(() => {
    if (!open || !step?.route) return;
    if (location.pathname !== step.route) navigate(step.route, { replace: true });
  }, [open, step, location.pathname, navigate]);

  // Pre-paint default: the card starts centred so it can never flash at (0,0).
  useLayoutEffect(() => {
    if (open && cardRef.current) positionCard(cardRef.current, null);
  }, [open, step]);

  /**
   * THE FIX — one tracking loop per step.
   *
   * The old overlay measured the target once and froze, and never scrolled:
   * steps deep in the page spotlighted elements below the fold, and entrance
   * animations / async charts / alert toasts left the highlight misplaced.
   * This loop instead
   *   1. keeps querying the DOM until a data-driven target mounts
   *      (live camera section, evidence vault, …),
   *   2. scrolls the target into view the moment it is found,
   *   3. re-measures EVERY FRAME so the spotlight follows layout shifts
   *      and scrolling for as long as the step is on screen.
   */
  useEffect(() => {
    if (!open || !step) return;
    const target = step.target;
    setPhase(target ? 'acquiring' : 'ready');

    const fireOnce = () => {
      if (step.action && !firedActions.current.has(step.id)) {
        firedActions.current.add(step.id);
        window.setTimeout(step.action, 80);
      }
    };
    if (!target) fireOnce();

    let stopped = false;
    let raf = 0;
    let el: Element | null = null;
    let lastQuery = -QUERY_EVERY_MS;
    let gaveUp = false;
    let last: Rect | null = null;
    let lastCenter = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      if (stopped) return;
      const card = cardRef.current;
      const spotlight = spotlightRef.current;

      // 1. acquisition — keep looking while the target has not mounted yet.
      if (target && !el && now - lastQuery >= QUERY_EVERY_MS) {
        lastQuery = now;
        const found = document.querySelector(target);
        if (found) {
          const probe = found.getBoundingClientRect();
          if (probe.width >= MIN_SIZE || probe.height >= MIN_SIZE) {
            el = found;
            const rect = { x: probe.x, y: probe.y, w: probe.width, h: probe.height };
            // 2. bring the spotlighted element on screen before showing it.
            if (!isOnScreen(rect, window.innerHeight)) scrollTargetIntoView(el);
            setPhase('ready');
            fireOnce();
          }
        } else if (!gaveUp && now - startedAt >= GIVE_UP_MS) {
          // Target never appeared (backend down, empty dataset): fall back to
          // a centred card instead of a spotlight pointing at nothing.
          gaveUp = true;
          setPhase('fallback');
          fireOnce();
        }
      }

      if (el && card && spotlight) {
        const dom = el.getBoundingClientRect();
        if (dom.width < 1 && dom.height < 1) {
          // Target unmounted mid-step (data refreshed, section gone) — re-acquire.
          el = null;
          last = null;
        } else {
          const rect: Rect = { x: dom.x, y: dom.y, w: dom.width, h: dom.height };
          // 3. follow every layout shift and scroll, frame by frame.
          const moved =
            !last ||
            Math.abs(last.x - rect.x) > MOVE_EPS ||
            Math.abs(last.y - rect.y) > MOVE_EPS ||
            Math.abs(last.w - rect.w) > MOVE_EPS ||
            Math.abs(last.h - rect.h) > MOVE_EPS;
          if (moved) {
            writeIfChanged(spotlight, 'left', `${rect.x - PAD}px`);
            writeIfChanged(spotlight, 'top', `${rect.y - PAD}px`);
            writeIfChanged(spotlight, 'width', `${rect.w + PAD * 2}px`);
            writeIfChanged(spotlight, 'height', `${rect.h + PAD * 2}px`);
            last = rect;
          }
          writeIfChanged(spotlight, 'opacity', '1');
          // A late chart render or an incoming toast can push the target out
          // of the viewport after the fact — pull it back (throttled, and
          // only for targets small enough to actually fit).
          const vh = window.innerHeight;
          const clipped =
            Math.max(0, STICKY_SAFE - rect.y) + Math.max(0, rect.y + rect.h - (vh - EDGE));
          const fits = rect.h < vh - STICKY_SAFE - EDGE;
          if (fits && clipped / Math.max(rect.h, 1) > 0.6 && now - lastCenter > 1500) {
            lastCenter = now;
            scrollTargetIntoView(el);
          }
          positionCard(card, rect);
        }
      }

      if (!el) {
        if (spotlight) writeIfChanged(spotlight, 'opacity', '0');
        if (card) positionCard(card, null);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [open, step, location.pathname]);

  // Keyboard navigation — but never steal keys from a field being typed in.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') tourStore.stop();
      else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        tourStore.next(total);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        tourStore.prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, total]);

  useEffect(() => {
    if (open) nextBtnRef.current?.focus();
  }, [open, i]);

  if (!open || !step) return null;

  const progress = Math.round(((i + 1) / total) * 100);

  return (
    <>
      <div
        className="fixed inset-0 z-[10040] cursor-pointer bg-slate-950/60 backdrop-blur-[1px]"
        onClick={() => tourStore.next(total)}
        aria-hidden
      />
      {/* The spotlight hole. Position is driven imperatively every frame by
          the tracking loop, so it must not carry a CSS position transition. */}
      <div
        ref={spotlightRef}
        data-tour-spotlight
        aria-hidden
        className="pointer-events-none fixed z-[10041] rounded-xl"
        style={{ opacity: 0, transition: 'opacity 150ms ease', boxShadow: '0 0 0 9999px rgba(2,6,23,.68), 0 0 0 2px rgba(37,99,235,.9), 0 0 0 6px rgba(37,99,235,.18), 0 8px 32px rgba(0,0,0,.35)' }}
      />

      <div
        ref={cardRef}
        data-tour-card
        role="dialog"
        aria-label={`Guided walkthrough step ${i + 1} of ${total}: ${step.title}`}
        className={cn(
          'fixed z-[10042] max-h-[calc(100vh-1.5rem)] w-[380px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(2,6,23,.25),0_0_0_1px_rgba(2,6,23,.06)] transition-[opacity,transform] duration-200 ease-out',
          phase === 'acquiring' && 'pointer-events-none opacity-0 translate-y-2',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="h-1 w-full bg-slate-100">
          <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white shadow-sm" aria-hidden>
              <Shield size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-blue-700">
                  Step {i + 1} / {total}
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-[11px] text-slate-500">{progress}%</span>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {TOUR_STEPS.map((s, si) => (
                <span
                  key={s.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    si === i ? 'w-5 bg-blue-600' : si < i ? 'w-1.5 bg-blue-300' : 'w-1.5 bg-slate-200',
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => tourStore.stop()}
              aria-label="Exit walkthrough"
              title="Exit (Esc)"
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} aria-hidden />
            </button>
          </div>

          <h3 className="text-[15px] font-bold leading-tight tracking-tight text-slate-900">{step.title}</h3>
          <p className="mt-2 text-[13px] leading-[1.55] text-slate-600">{step.body}</p>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => tourStore.prev()}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50',
                i === 0 && 'invisible',
              )}
            >
              <ChevronLeft size={13} aria-hidden /> Back
            </button>
            <span className="ml-auto text-[10px] text-slate-400">Esc to exit • ← → to navigate</span>
            <button
              ref={nextBtnRef}
              type="button"
              onClick={() => tourStore.next(total)}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-3.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              {i === total - 1 ? 'Finish Tour' : step.cta ?? 'Next'}
              {i < total - 1 && <ChevronRight size={13} aria-hidden />}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2">
          <p className="text-[10px] font-medium text-slate-500">
            TRINETRA AI — Gujarat Police • Professional Walkthrough • Click backdrop or press Enter to continue
          </p>
        </div>
      </div>
    </>
  );
}
