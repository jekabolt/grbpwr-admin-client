---
paths:
  - "src/**/*.tsx"
---

# UI rules — the owner's taste

The visual system is normative in `DESIGN.md` and the "Visual design" section of `AGENTS.md`. Read
them before building a screen; this file only adds the owner's rules on top and does not repeat them.

## Before code
- Mockup → owner OK → build. A new screen or a rework starts as a short plan + mockup; no code until
  the owner answers (code fixes decisions he has not made yet).
- Write down the ONE question the screen or tab answers. Anything that does not answer it moves to
  auto-fill or another tab.

## Show less
- Show only what the user needs to take the next step; rarely used fields go behind a fold or away.
- No explanatory UI text: labels are 1–3 words; no paragraphs, hint lines or legends. If a mockup
  needs a legend, it is too much.
- Cells hold values, not boxes. No source chips, badges or tags by default; a problem is red text plus
  one `! N` in the block header.
- Fewest clicks: auto-fill every field that has a source (it stays editable); ask only the remainder,
  as quiz chips at the moment it matters. A create form whose fields are all auto disappears
  (placeholder → create → open).
- One main action per block; warnings and secondary actions live in the block header.

## Controls and type
- Header buttons are plain underlined words (`edit`, `+ add`), never framed or filled buttons.
- No bold for emphasis. Weight 700 only where DESIGN.md puts it (section titles, stat values).
- One control size per row: inputs, selects, pickers and picture slots in one row share one footprint
  (a small select next to a big tile reads as broken).
- Colour only on text and borders, brand tokens only; never `bg-{error,warning,success}/NN` washes
  (the owner rejects them as "coral"). State is a word or a glyph, not colour alone.
- Lists and pickers: scannable cards/tiles with a thumbnail. Tabs inside a tech card: the barest
  matrix, cells = values. Plain tables only for genuinely dense comparison.
- Visible UI text is English.

## Reuse
- Reuse existing primitives before writing anything: `src/ui` (`Section`/`SectionStack`,
  `confirmation-modal`, `media-viewer`, `checklist-editor`, form fields incl. `decimal-field`,
  `currency-select`, `unified-translation-fields`), `tasks/components/entity-picker.tsx`,
  `hero/components/tag-picker.tsx`, `managers/page/charts/`. A new primitive or a new dependency
  needs the owner's OK.
