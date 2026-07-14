# Product

## Register

product

## Users

Internal GRBPWR store operators (a small team, not end shoppers) managing every
piece of storefront content and operations: products, media, the hero, the
archive/timeline, promos, orders, shipping, membership, and support. They work
primarily on desktop, in focused content-ops sessions, and are fluent with the
tool — speed and predictability matter more than hand-holding. Many edits map
1:1 to something a shopper will see, so "what will this look like live" is a
constant question.

## Product Purpose

A pure frontend admin SPA (React 19 + TS) over a gRPC-gateway backend. It exists
to let operators compose and publish storefront content quickly and without
mistakes. Success = a content change is fast to make, its live result is
obvious before publishing, and destructive or irreversible actions (publishing
over the live hero, deleting blocks) are hard to trigger by accident.

## Brand Personality

Utilitarian, precise, fast. A brutalist monochrome control surface — black on
white, hard 1px borders, uppercase monospace type, literal glyph controls
(`[x]`, `+`, `⠿`). It reads as a machine console, not a consumer SaaS app: no
decoration for its own sake, information-dense but legible, every control does
one obvious thing. Three words: stark, exact, quick.

## Anti-references

- Rounded, pastel, card-heavy consumer SaaS dashboards (Notion/Linear-lite
  clones). This app is deliberately hard-edged and monochrome.
- Gradient accents, drop shadows, glassmorphism, playful illustration — none of
  it belongs here.
- Wizard-style over-explained flows. These are expert users; don't pad the path.

## Design Principles

- **Preview parity.** Editing surfaces show what the storefront will render.
  The live preview is the source of truth, not an afterthought.
- **Guard the irreversible.** Publishing over live content and destructive edits
  get a confirmation and a clear summary of consequences; nothing important is
  one stray click away.
- **Surface incomplete state early.** Flag blocks that can't publish before the
  user hits save, in the rail, not only as a post-submit error.
- **Keyboard-first speed.** Power users get search-to-add, Enter-to-confirm,
  Cmd/Ctrl+S. The mouse is optional.
- **One editor grammar.** Hero, archive/timeline, and future block editors share
  the same rail + modal + preview shape and the same components, so learning one
  teaches the rest.

## Accessibility & Inclusion

Target WCAG AA. Body/label text uses `labelColor` (#666, ~5.7:1), never the
decorative `textInactiveColor` (#ccc). Every interactive control has a visible
`focus-visible` outline. Honor `prefers-reduced-motion` for any added motion.
Monochrome-safe: state is never carried by color alone (unsaved = worded badge,
incomplete = `!` glyph, not just red).
