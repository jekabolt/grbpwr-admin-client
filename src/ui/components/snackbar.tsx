import { markAlertBeingRead, muteRepeats, useSnackBarStore } from 'lib/stores/store';
import { Alert } from 'lib/stores/store-types';
import { useEffect, useRef, useState } from 'react';

/**
 * HOW LONG A TOAST STAYS, BY WHAT IT IS. One flat 6s was wrong in both directions at once: a
 * receipt ("saved") is read in the first half-second and then sits there taking up the corner,
 * while an error carries a sentence naming a field path and what to do about it, which nobody
 * finishes in six seconds. So a receipt goes early and an error stays; anything carrying an action
 * button stays longest, because it is asking to be clicked, not read.
 */
const TOAST_MS: Record<Alert['severity'], number> = { success: 3000, error: 8000 };
const TOAST_MS_WITH_ACTION = 12000;

/**
 * THE CEILING ON A TOAST'S WHOLE LIFE, counted from its first appearance and honoured no matter
 * what happens afterwards.
 *
 * Two different mechanisms can otherwise postpone a dismissal forever, and both were measured
 * doing it: a repeat restarts the duration (a message re-reported every 1.5s was still up at 23
 * seconds, count 16), and a pointer resting on the column freezes it. Neither is wrong on its own
 * — the message really is still happening, the pointer really is there — but neither has a
 * terminating condition, and a corner that never clears is the complaint this whole change exists
 * to answer. Twenty seconds is well past reading a footnote; anything that must survive being read
 * belongs in a `CalloutBox`, which DESIGN.md says stays until it is resolved.
 *
 * ⚠ THIS OVERRIDES `markAlertBeingRead`. A toast held under the pointer, with its text selected,
 * is still closed the moment it reaches twenty seconds — the store's "reading is exactly the state
 * in which nothing should disappear" is a rule about EVICTION, not a promise of immortality. Said
 * plainly here because the two sentences otherwise contradict each other, and the owner is being
 * asked which he wants.
 */
const TOAST_MAX_LIFE_MS = 20000;

/**
 * Does a live selection cover any part of this row? Range INTERSECTION, deliberately: an
 * `anchorNode` test only recognises a selection that STARTED inside the row, so a select-all over
 * the page left the sentence unprotected while looking correct.
 */
function selectionCovers(sel: Selection | null, row: Element): boolean {
  if (!sel || sel.isCollapsed) return false;
  for (let i = 0; i < sel.rangeCount; i += 1) {
    if (sel.getRangeAt(i).intersectsNode(row)) return true;
  }
  return false;
}

/**
 * THE TOAST COLUMN — one inverted block, not a pile of cards.
 *
 * The round-14 complaint was four complaints in one: the stack takes too much room, it lingers,
 * the ✕ is too small to hit, and the same message piles up. Three of the four are answered by the
 * store (coalescing, the cap of four, monotonic ids); the room and the ✕ are answered here, and
 * the answer is the design system's own grammar rather than a new one.
 *
 * DESIGN.md: white is the material a block is cut from, one border per logical block, and
 * structure INSIDE a block is drawn with ruled lines rather than with nested boxes. A toast column
 * is that block, inverted — ink stock, white ink — because it floats over the page instead of
 * being part of it. Which means the six separately-bordered bars separated by six gaps were
 * box-in-box: six blocks where there is one list. They are now ONE bordered column whose rows are
 * separated by a 1px inner rule, exactly like the rows of any other block in the app. That alone
 * removes a border, a gap and six pixels of padding per toast; with `px-3 py-1.5` a one-line toast
 * is 30px tall against the old 41 + 8 of gutter, and the cap of four bounds the whole column at
 * 141px against roughly 294 for six loose bars.
 *
 * The two alphas are NOT invented here: `bgColor/40` for the outer outline and `bgColor/20` for
 * the inner rule are the pair `media-viewer.tsx` already established on the app's other inverted
 * surface. The first version of this file painted the outer border in `textColor` — the same value
 * as the fill, i.e. two pixels of nothing — which is the inverted way of shipping a bordered box
 * with no border at all.
 *
 * The `dismiss all` door is the LAST thing in the column, at the bottom — the one edge that never
 * moves as toasts arrive and expire, because the box is pinned by `bottom-5` and grows upward. A
 * door that stays put can be aimed at; a door riding on top of a growing stack cannot.
 *
 * The newest toast is at the top. What changed is HOW: the old code got that order from
 * `flex-col-reverse`, which flips the painting order but not the DOM, so the reading order for a
 * screen reader and the tab order for a keyboard ran bottom-to-top — door first, then oldest to
 * newest, the exact opposite of what a sighted operator sees. Reversing the array instead and
 * laying out with a plain `flex-col` puts DOM order, paint order and tab order into one sequence.
 *
 * WHY THIS FILE HAND-ROLLS ITS BUTTONS instead of using `ui/components/button`. Every `src/ui`
 * primitive is written for ink-on-white: `Button`'s focus ring is `outline-textColor`, i.e. black
 * on black here, and its variants are assembled by `cva`, which concatenates without
 * tailwind-merge — so an override passed through `className` would leave both classes in the
 * markup and let stylesheet order decide. On the one inverted surface in the app, plain literal
 * class strings are the honest tool.
 *
 * Position: bottom-left, unchanged. The deployed build has rendered there since the component was
 * written; the round-14 screenshot was described as right-hand, and that could not be reconciled
 * with any code in the tree, so the corner is left alone rather than moved on a guess.
 */
export function SnackBar() {
  const alerts = useSnackBarStore((s) => s.alerts);
  const clearAll = useSnackBarStore((s) => s.clearAll);
  const columnRef = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  /** Last known position of the real pointer, and whether we have ever seen it move. */
  const pointer = useRef({ x: -1, y: -1, seen: false });
  /**
   * Whether the pointer got where it is UNDER ITS OWN POWER. See the "born paused" paragraph
   * below: presence alone is not enough to justify freezing the clock.
   */
  const arrived = useRef(false);
  /**
   * WHICH ROW IS BEING READ — held by IDENTITY, reassigned only by a real pointer move.
   *
   * Deriving it from the pointer's position on every column change looked equivalent and was not.
   * The column is bottom-pinned and drawn newest-first, so evicting a row BELOW the read one
   * slides every survivor down a slot, and `elementFromPoint` then faithfully reports the
   * NEIGHBOUR under a cursor that never moved. The guard migrated with it and the row the operator
   * was mid-selection on died to the next report — measured, and it is verbatim the defect the
   * guard was written to prevent, one layer down.
   */
  const reading = useRef<number | null>(null);
  /**
   * THE DOOR REFUSES A CLICK IT WAS NEVER AIMED AT.
   *
   * `dismiss all` only exists at two toasts or more, so on the 1→2 transition it comes INTO
   * EXISTENCE at the bottom of the column — exactly where the cursor of someone reading the single
   * toast is resting, since the pause is holding that toast there for that purpose. Completing the
   * gesture they had already started (click to dismiss what they were reading) then hit `clearAll`
   * and destroyed every toast including the one they had not seen, with no confirmation and no
   * undo. Measured: row top 851 → 827, door at 856, cursor at 865.
   *
   * So a destructive control that materialises under a motionless pointer stays inert until the
   * pointer moves — the same click-through guard a dialog uses. Keyboard activation is unaffected
   * (`e.detail === 0`), and the very next mouse movement arms it.
   */
  const doorArmed = useRef(true);
  const doorWasUp = useRef(false);

  /**
   * THE PAUSE IS DERIVED FROM GEOMETRY, NOT LATCHED BY ENTER/LEAVE EVENTS — and that is the whole
   * point, because three separate ways of desynchronising the latch were measured on the first
   * version of this component, one of which recreated the very complaint being fixed:
   *
   *  1. DISMISSING THE TOP ROW FROZE THE COLUMN FOREVER. The box is pinned at the bottom, so
   *     removing the NEWEST row shortens it upward, out from under the pointer that just clicked
   *     it. The `mouseleave` that would clear the latch is aimed at a node no longer in the tree,
   *     so React never delivers it and moving the pointer afterwards does not help. Measured:
   *     two survivors of a three-toast stack still on screen 12s later, and with only two toasts
   *     the survivor never leaves at all — there `alerts.length` never reaches zero, so an
   *     empty-column reset cannot fire even in principle.
   *  2. A TOAST BORN UNDER A RESTING POINTER WAS BORN PAUSED. Chromium dispatches the enter when
   *     content appears beneath a stationary cursor, and no leave ever follows. Click `dismiss
   *     all`, leave the mouse where it is, let a background job report something: immortal.
   *  3. Neither showed up in a green probe run, because a test that raises toasts by CLICKING
   *     buttons relocates the pointer as a side effect and silently repairs the latch.
   *
   * So: remember where the pointer actually is, and recompute containment on every pointer move
   * AND on every change to the column. A box that moves out from under a still pointer is now
   * indistinguishable from a pointer that moved out of a still box, which is the correct model.
   *
   * `arrived` is the second half, and it is what stops (2). Presence is only allowed to freeze the
   * clock if a pointer MOVE put the pointer inside; a column that materialises around a parked
   * cursor does not pause, because a parked cursor is not a person reading. Once presence is
   * established it survives the column growing or shrinking under it, so genuine reading is not
   * interrupted by the next toast arriving.
   *
   * The same walk names the row under the pointer for the store, which is what keeps eviction from
   * destroying the row being read (hover freezes timers, and eviction is not a timer).
   */
  useEffect(() => {
    if (alerts.length === 0) {
      arrived.current = false;
      reading.current = null;
      doorWasUp.current = false;
      markAlertBeingRead(null);
      setPaused(false);
      return;
    }
    /* The door coming into existence disarms it; it stays inert until the pointer moves. */
    const doorUp = alerts.length > 1;
    if (doorUp && !doorWasUp.current) doorArmed.current = false;
    doorWasUp.current = doorUp;

    const resolve = (moved: boolean) => {
      const el = columnRef.current;
      const p = pointer.current;
      if (!el || !p.seen) {
        reading.current = null;
        markAlertBeingRead(null);
        setPaused(false);
        return;
      }
      const r = el.getBoundingClientRect();
      const inside = p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
      /* A move may ESTABLISH presence; a mere reflow may only preserve or revoke it. */
      arrived.current = moved ? inside : arrived.current && inside;
      /* Only a real move may say WHICH row is being read. A reflow keeps the answer it already
         had — that is the whole difference between holding a row and holding a pixel. */
      if (moved) {
        const row = inside ? document.elementFromPoint(p.x, p.y)?.closest('[data-toast-id]') : null;
        reading.current = row ? Number(row.getAttribute('data-toast-id')) : null;
      }
      if (!arrived.current) reading.current = null;
      /* A row that has since gone cannot still be under the cursor. */
      if (reading.current !== null && !alerts.some((a) => a.id === reading.current)) {
        reading.current = null;
      }
      markAlertBeingRead(reading.current);
      setPaused(arrived.current);
    };
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, seen: true };
      doorArmed.current = true;
      resolve(true);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    /* The column just changed shape. Re-answer "is the pointer on it" from the geometry. */
    resolve(false);
    return () => window.removeEventListener('pointermove', onMove);
  }, [alerts]);

  /* No alerts, no block. The column is a filled, bordered box now, so an empty one would park a
     black rectangle in the corner forever. */
  if (alerts.length === 0) return null;

  /* With the door last, "is there something below this row" is true for every row exactly when the
     door is drawn, which is exactly when there is more than one toast. One flag, both jobs. */
  const stacked = alerts.length > 1;

  return (
    <aside
      ref={columnRef}
      data-toasts=''
      data-toast-total={alerts.length}
      aria-label='Notifications'
      className='fixed bottom-5 left-5 z-[var(--z-toast)] flex w-80 flex-col rounded-none border border-bgColor/40 bg-textColor'
    >
      {/* Newest first, so the eye and the caret both start where the news is. */}
      {[...alerts].reverse().map((alert) => (
        <ToastItem key={alert.id} alert={alert} paused={paused} ruled={stacked} />
      ))}
      {/* The whole 320px strip is the target — the literal answer to "the ✕ is too small": at
          column level the door is the width of the block. Hover inverts it, the same fill-flip
          every secondary control in the system uses, read backwards because the ground is ink. */}
      {stacked ? (
        <button
          type='button'
          data-toast-clear=''
          onClick={(e) => {
            /* `detail === 0` is a keyboard activation, which was always aimed. A mouse click on a
               door that appeared under a motionless cursor is not, and this one is irreversible. */
            if (e.detail > 0 && !doorArmed.current) return;
            clearAll();
          }}
          className='flex w-full shrink-0 items-center justify-between px-3 py-1 text-micro uppercase tracking-label text-bgColor transition-colors hover:bg-bgColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bgColor'
        >
          <span>dismiss all</span>
          {/* Sits in the same 24px gutter as every row's ✕, so the column has one close edge. */}
          <span aria-hidden='true' className='flex w-6 justify-center'>
            ✕
          </span>
        </button>
      ) : null}
    </aside>
  );
}

function ToastItem({
  alert,
  paused,
  ruled,
}: {
  alert: Alert;
  paused: boolean;
  /** Draw the 1px inner rule under this row — true whenever something is below it. */
  ruled: boolean;
}) {
  /**
   * `closeMessage` is read from the store rather than handed down as a closure. A fresh
   * `onClose={() => closeMessage(id)}` on every parent render would re-run this effect every time
   * ANY toast arrives or leaves, restarting the timers of all the others — the stack would then
   * only ever expire together, on the clock of the last arrival. The store's action identity is
   * stable, so the dependency list below is made of primitives and nothing else restarts a timer.
   */
  const closeMessage = useSnackBarStore((s) => s.closeMessage);
  const { id, nonce, action, severity, count, message, bornAt } = alert;

  useEffect(() => {
    /* The ceiling is absolute: whatever the pointer does and however often the message repeats,
       what is left of twenty seconds is the most this toast can still have. */
    const ceiling = bornAt + TOAST_MAX_LIFE_MS - Date.now();
    /* Paused still ARMS a timer — at the ceiling rather than at the duration. A pause with no
       timer at all is how a frozen corner happens. */
    const own = action ? TOAST_MS_WITH_ACTION : TOAST_MS[severity];
    const wait = paused ? ceiling : Math.min(own, ceiling);
    /* Ending BY THE CEILING is different from ending on time, and only the former mutes: a toast
       that reached twenty seconds while REPEATING is spam, and letting the next repeat re-open it
       is how the ceiling degenerated into a blink. A toast that reached the ceiling merely because
       someone was reading it repeats nothing and mutes nothing. */
    const byCeiling = wait >= ceiling;
    const end = () => {
      if (byCeiling && count > 1) muteRepeats(severity, message);
      closeMessage(id);
    };
    if (ceiling <= 0) {
      end();
      return;
    }
    const timer = setTimeout(end, wait);
    return () => clearTimeout(timer);
    /* `nonce` is in here on purpose: a coalesced repeat must reset the clock. Leaving the column
       (paused → false) restarts the duration whole rather than resuming a remainder — a toast the
       operator just finished reading has earned its full time back if it is still there. */
  }, [closeMessage, id, nonce, action, severity, paused, bornAt, count, message]);

  return (
    <div
      data-toast=''
      data-toast-id={id}
      data-toast-severity={severity}
      data-toast-count={count}
      /* Errors interrupt assistive tech, receipts do not. */
      role={severity === 'error' ? 'alert' : 'status'}
      /* The whole surface dismisses. The ✕ below stays as the named, focusable door — this is
         pointer convenience on top of it, never instead of it.
         EXCEPT WHEN THE GESTURE WAS A COPY. An error toast carries the one copy of a server
         sentence with a field path in it, and pasting that to whoever can fix it is a real
         gesture. A plain "the whole row dismisses" would have made selecting that text
         impossible: the mouse-up ending the drag IS the click. So a click landing while a
         selection covers any part of THIS row is a copy, not a dismissal.
         Range INTERSECTION, not `anchorNode`: an anchor test only recognises a selection that
         started inside the row, so a select-all over the page left the sentence unprotected. The
         ✕ ignores this check entirely, so a toast is never made unclosable by a stray selection. */
      onClick={(e) => {
        if (selectionCovers(window.getSelection(), e.currentTarget)) return;
        closeMessage(id);
      }}
      className={`flex shrink-0 cursor-pointer items-start gap-2 px-3 py-1.5 text-micro text-bgColor transition-[opacity,translate] duration-150 ease-out translate-y-0 starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none ${
        ruled ? 'border-b border-bgColor/20' : ''
      }`}
    >
      {/* The severity word, not a coloured dot: state is never carried by colour alone here.
          `error` keeps the system's red — #ff0000 on ink measures 5.25:1, still AA — while `ok` is
          plain white (21:1). The system's green #0f7a34 is tuned for AA on WHITE stock and falls to
          3.85:1 on ink, i.e. BELOW AA, which is what the deployed toast has been shipping. Making
          it legible would have meant inventing a lighter green, a token this system does not have;
          dropping it costs nothing, because the word already says which of the two it is. */}
      <span
        className={`shrink-0 font-bold uppercase tracking-label ${severity === 'error' ? 'text-error' : ''}`}
      >
        {severity === 'error' ? 'error' : 'ok'}
        {count > 1 ? <span className='tabular-nums'>{` ×${count}`}</span> : null}
      </span>
      {/* The one part of a toast that is arbitrary-length prose — a server sentence naming what is
          still referenced and what to do about it. It wraps; it is never clamped or truncated,
          because a half-shown error is worse than a tall one. */}
      <span data-toast-body='' className='flex-1'>
        {message ?? ''}
      </span>
      {action ? (
        <button
          type='button'
          data-toast-action=''
          onClick={(e) => {
            /* Without this the row's own dismiss would also fire. Same outcome, but the action
               would then run against a toast already being removed. */
            e.stopPropagation();
            action.onClick();
            closeMessage(id);
          }}
          className='shrink-0 rounded-none px-1 font-bold uppercase tracking-label underline underline-offset-2 transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bgColor'
        >
          {action.label}
        </button>
      ) : null}
      {/* 24×24 of real target inside a 30px row: the negative margin lets the button be bigger
          than the line it sits on without making the row taller. The old `p-1` around a glyph
          measured 16×18 and the owner named it by hand. `✕` is the door; the `×N` above is a
          multiplication sign, a different glyph for a different job. `aria-label` is the control's
          only name — a `title` would have added a second, competing one plus a tooltip over the
          prose the operator is reading. */}
      <button
        type='button'
        data-toast-close=''
        aria-label='Dismiss notification'
        onClick={(e) => {
          e.stopPropagation();
          closeMessage(id);
        }}
        className='-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-none leading-none transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bgColor'
      >
        ✕
      </button>
    </div>
  );
}
