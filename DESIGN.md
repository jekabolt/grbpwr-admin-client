---
name: GRBPWR Admin
description: Brutalist monochrome control surface for store operators — white blocks on a grey ground, hierarchy drawn in rules.
colors:
  ink: "#000000"
  ground: "#f2f2f2"
  block: "#ffffff"
  edge: "#cccccc"
  rule: "#e6e6e6"
  label: "#666666"
  panel: "#ededed"
  zebra: "#fafafa"
  track: "#f0f0f0"
  progress: "#e2e2e2"
  red: "#ff0000"
  blue: "#2323ff"
  purple: "#311eee"
  green: "#0f7a34"
  overlay: "#00000066"
typography:
  display:
    fontFamily: "FeatureMono, Inter, Helvetica Neue, Arial, sans-serif"
    fontSize: "200px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "normal"
  headline:
    fontFamily: "FeatureMono, Inter, Helvetica Neue, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  title:
    fontFamily: "FeatureMono, Inter, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.06em"
  body:
    fontFamily: "FeatureMono, Inter, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "FeatureMono, Inter, Helvetica Neue, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.04em"
  control:
    fontFamily: "FeatureMono, Inter, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.04em"
  stat:
    fontFamily: "FeatureMono, Inter, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  none: "0px"
spacing:
  hair: "2px"
  tight: "4px"
  row: "6px"
  stack: "10px"
  block: "16px"
  gutter: "24px"
components:
  block:
    backgroundColor: "{colors.block}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.block}"
  button-main:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.block}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "10px 16px"
  button-main-hover:
    backgroundColor: "{colors.block}"
    textColor: "{colors.ink}"
  button-main-disabled:
    backgroundColor: "{colors.block}"
    textColor: "{colors.edge}"
  button-secondary:
    backgroundColor: "{colors.block}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.block}"
  input:
    backgroundColor: "{colors.block}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "3px 7px"
    height: "22px"
  pill:
    backgroundColor: "transparent"
    textColor: "{colors.label}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "1px 7px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.block}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "1px 7px"
  stat-cell:
    backgroundColor: "{colors.block}"
    textColor: "{colors.ink}"
    typography: "{typography.stat}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
  board-column-header:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 8px"
---

# Design System: GRBPWR Admin

## 1. Overview

**Creative North Star: "The Machine Console"**

This is not an app that decorates data; it is an instrument panel that admits what it knows. Operators run long, focused content-ops sessions and read hundreds of values per screen, so density is a feature and every pixel of ornament is a tax. The surface is black ink on white stock, ruled with hard 1px lines, set in uppercase mono, and controlled with literal glyphs (`[x]`, `+`, `⠿`, `✕`). Nothing is rounded, nothing floats, nothing glows.

The system's whole spatial logic is one inversion, and it is the thing to internalise before writing a single new screen: **white is not the background, it is the material.** The page ground is grey (`#f2f2f2`). White is the stock a logical block is cut from, and the grey showing through between blocks IS the divider. You never draw a separator between two blocks; you leave a gap and let the ground do it. Everything else follows from that: a bordered box must be filled or the ground bleeds through its contents, a block never contains another block, and structure inside a block is drawn with ruled lines at four distinct weights rather than with nested containers.

What this explicitly rejects, in PRODUCT.md's own words: *"rounded, pastel, card-heavy consumer SaaS dashboards (Notion/Linear-lite clones)"*, and *"gradient accents, drop shadows, glassmorphism, playful illustration"*. It also rejects wizard-style over-explanation; these are expert users and the path is never padded.

**Key Characteristics:**
- Grey ground, white blocks, zero corner radius, zero inline shadow.
- The gap between blocks is the divider. Separators are subtractive, not drawn.
- One border per logical block. Box-in-box is prohibited.
- Hierarchy inside a block comes from four ruled weights, not from fills or nesting.
- Monochrome by default; colour only ever carries state, never decoration.
- Uppercase mono labels at 9–12px; body text tops out at 12px.

## 2. Colors

A monochrome ramp doing structural work, plus four semantic colours that are never allowed to decorate.

### Primary
- **Ink** (`#000000`): All body text, every heading, the fill of a primary button, the fill of a selected chip, and the two heaviest rules in the ladder. There is no "dark grey text" in this system.

### Neutral
- **Ground** (`#f2f2f2`): The page canvas, set once on `body`. Content never sits directly on it; only blocks do. The gaps between blocks are ground, and those gaps are the dividers.
- **Block** (`#ffffff`): The material every logical block is cut from. Also the fill of inputs, selects, chips at rest and tooltips.
- **Edge** (`#cccccc`): The **outer** 1px outline of every block, input, pill and chip. Doubles as disabled/placeholder ink (`textInactiveColor` is the same value).
- **Rule** (`#e6e6e6`): The **inner** 1px line between rows inside a block. Under print media it is bumped to `#cccccc` so it survives paper.
- **Label** (`#666666`): Secondary ink for field labels, hints, group titles, units. ~5.7:1 on white. This is the only permitted grey for text.
- **Panel** (`#ededed`): A fill, not a container. Used for board column headers and header strips inside a block, where a tint is wanted but a new box is not.
- **Zebra** (`#fafafa`): Stat cells, accordion headers, sub-rows.
- **Track** (`#f0f0f0`) / **Progress** (`#e2e2e2`): Bar tracks and their fills.

### Secondary — status only
- **Red** (`#ff0000`): Broken, missing, blocking, over budget, about to be destroyed.
- **Blue** (`#2323ff`): Mid-flight, needs a human — in review, round 2, unsaved, changed-after-approval, stale. Deliberately blue; do **not** "correct" this to amber.
- **Green** (`#0f7a34`): Done, approved, in stock, under budget. ~4.6:1 on white.
- **Purple** (`#311eee`): Links and the single highlight accent.

### Named Rules

**The Ground Rule.** `#f2f2f2` is the canvas and only layout may touch it. No layout container is ever allowed to paint white over it — the moment a wrapper does, every divider on the page disappears at once and the design collapses into a white sheet.

**The Gap-Is-The-Divider Rule.** The separator between two blocks is the gutter, not a line. Never add `border-t` between stacked blocks: both neighbours already carry their own outline, so a drawn line in the gutter renders as a triple rule.

**The Filled-Block Rule.** A bordered block always carries the white fill. `border` without `background` is transparent, the ground shows through the content, and data stops reading as data.

**The Two-Greys Rule.** `#cccccc` is the OUTER outline of a box. `#e6e6e6` is the INNER line between rows. Swapping them is the single most visible way to miss this system, and it is not a matter of taste.

**The Monochrome Rule.** Red, blue, green and purple carry state and nothing else — never a mood, never a category, never a decorative accent. And state is never carried by colour alone: unsaved is a worded badge, incomplete is a `!` glyph, blocked is a labelled chip.

## 3. Typography

**Single Font:** FeatureMono (Thin 100 / Regular 400 / Bold 700), falling back to Inter, Helvetica Neue, Arial. There is no second family and no display face. Contrast comes from weight, case, tracking and size, never from a competing typeface.

**Character:** Machine-cut and even-width. Numbers align in columns without being asked (value columns are `tabular-nums` at the primitive level), which is why long stacks of figures read as a ledger rather than as prose.

### Hierarchy
- **Display** (400, 110px mobile / 200px desktop): Login splash and hero only. Never inside the app shell.
- **Headline** (400, 18px): The one large size. Reserved for page-level titles.
- **Title** (700, 12px, uppercase, 0.06em): Section titles — the text sitting on the 2px rule that opens a block.
- **Body** (400, 12px, 1.5): Field values, table cells, all running text. The working size of the entire product.
- **Control** (400, 11px, uppercase, 0.04em): Chips, buttons, tabs, option labels.
- **Label** (400, 10px, uppercase, 0.04em): Field labels, pills, table headers, hints, group titles.
- **Nano** (400, 9px, uppercase): Badges, pin numbers, band labels.
- **Stat** (700, 16px / 22px, tabular): KPI values inside a stat cell.

### Named Rules

**The Twelve-Pixel Ceiling Rule.** Body text is 12px and the chrome sizes go *down* from there (11 / 10 / 9), never up. The only sizes above 12 are the 18px page headline and the two stat sizes. A screen that needs a bigger font to establish hierarchy has a layout problem, not a type problem.

The ceiling is enforced by `body { font-size: var(--text-textBaseSize) }` in `global.css`, and that declaration is load-bearing: Tailwind's preflight sets no font-size, so without it every element that does not name a size itself falls back to the browser's 16px. That is how the app ran until 2026-08-14 — table cells and `Row` values a third larger than the 12px section title above them, which is why tables read as big and heavy. If body text ever looks oversized again, check that line before touching a screen.

**The No-Hand-Tracking Rule.** Letter-spacing is baked into the four `tracking` tokens (`pill` 0.03em, `label` 0.04em, `group` 0.05em, `section` 0.06em) and applied through the `Text` primitive. No screen sets `letter-spacing`, `font-size` in px, or `tabular-nums` by hand. Outside `src/ui`, writing `text-[Npx]` is prohibited.

**The Uppercase-Is-A-Label Rule.** Uppercase marks a label, a control or a section title — things of four words or fewer. Sentences and hints stay sentence case at `label` colour.

## 4. Elevation

The system is flat and layers **tonally**, not with shadows. Depth is expressed by a four-step surface ramp — ground `#f2f2f2` → block `#ffffff` → panel `#ededed` → zebra `#fafafa` — plus 1px outlines. Nothing that sits in the document flow is ever allowed a shadow; the only elevated things are the ones that genuinely float above it.

### Shadow Vocabulary
- **Modal** (`box-shadow: 0 6px 22px rgba(0,0,0,0.22)`): Dialogs only.
- **Popover** (`box-shadow: 0 4px 14px rgba(0,0,0,0.18)`): Selects, date pickers, entity pickers, tooltips.
- **Card lift** (`transform: translateY(-1px); box-shadow: 2px 2px 0 0 #000`): The one signature exception — a draggable board card on hover. A hard offset with **zero blur**, so it reads as a sheet of paper pushed sideways, not as a soft glow.

### Z-Index Scale
Semantic only, referenced through variables: sticky page chrome (20) < nav (45) < modal (50) < popover-in-modal (60) < toast (70). Arbitrary values like `999` are prohibited.

### Named Rules

**The Flat-By-Default Rule.** If an element is in the document flow, it has no shadow. A shadow is a claim that something is floating above the page, and in this system only three things ever are: a modal, a popover, and a card being dragged.

**The Zero-Radius Rule.** `border-radius: 0` everywhere, including buttons, inputs, chips, pills, avatars and images. There are no pill-shaped controls. If it looks like a 2014 app, the corners got rounded and a shadow got soft.

## 5. Components

### The Block — the signature component

The unit the entire product is built from. One logical block = one white rectangle on the grey ground.

```tsx
<section className='space-y-2.5 border border-borderColor bg-bgColor p-4'>
  <SectionHeader title='identification' question='— what this style is' />
  {children}
</section>
```

- **Corner Style:** square (0px).
- **Background:** block white (`#ffffff`), always present.
- **Border:** 1px solid edge (`#cccccc`) on all four sides.
- **Internal Padding:** 16px. **Internal stack:** 10px between children.
- **Separation from siblings:** a 24px gutter of ground. No drawn line.
- **Shadow Strategy:** none. See Elevation.

Page chrome is a block too: the tech-card header is a full-bleed white bar with a 1px bottom edge, separated from the content below by the same grey gutter.

### The Rule Ladder — hierarchy inside a block

Structure inside a block is drawn with exactly four ruled weights. This is what replaces nesting.

| Level | Rule | Component |
|---|---|---|
| Block title | 2px solid ink, below the title | `SectionHeader` |
| Sub-group | 1px solid edge `#cccccc` | `GroupLabel` |
| List row | 1px solid rule `#e6e6e6` | `Row` |
| Closing total | 1px solid ink | `RowTotal` |

`SectionHeader` also carries an optional grey trailing clause (`question`) that says what the block is FOR — that clause is most of why the product reads as explained rather than merely labelled. Use it.

### Buttons
- **Shape:** square (0px), `leading-4`, centred.
- **Main** (page actions only — Save, Release, Create): ink fill, white text, 1px ink border, 10px/16px padding, 12px type. Hover inverts to white-on-ink-border.
- **Secondary** (everything inside a panel): white fill, 1px edge border, ink text, 10px label type uppercase, 4px/10px padding. Hover inverts to a solid ink fill.
- **Disabled:** never a filled grey slab. It becomes an outline: white fill, edge-coloured border and text.
- **Focus:** `outline: 2px solid #000` at 2px offset, on every interactive control without exception.
- **Sizes:** `xs` in a table row, `sm` in a panel (the default), `lg` for page-level actions only.

### Pills and Chips
Same shape, different contract, and mixing them is a bug: **a Pill is read-only, a Chip is clickable.**
- **Pill:** transparent background, 1px border and text sharing one tone colour — ok (green), warn (red), attention (blue), mut (grey), ink (black). 10px uppercase, 0.03em.
- **Chip:** at rest, white fill with an edge border and label-grey text; hovering darkens the text to ink. **Selected fills solid with ink and flips the text to white.** Supports a dashed variant for "add" affordances and a trailing `✕` for removal.

### Inputs and Selects
- **Style:** 1px edge border, white fill, square, 22px minimum height, 3px/7px padding, 12px body type. Textareas take a 44px minimum and resize vertically only.
- **Focus:** the border goes from edge grey to solid ink. No ring, no glow, no colour shift.
- **Error:** `aria-invalid` drives a red border, styled once in `ui/form` — never per screen.

### Stat Grid
An auto-fitting grid of KPI cells (`repeat(auto-fit, minmax(110px, 1fr))`). **It fills white once at the container and rules internally with 1px edge lines** — a table, not a row of nested cards. Each cell is a label / value / sub triple, with `up` green and `down` red as the only tones. A cell with no data renders `—`, never `0`.

### Board (kanban / fulfilment lanes)
A horizontally scrolling row of bordered white columns. The column header is a panel-tinted strip (`#ededed`) with a 1px bottom edge, carrying a bold uppercase title and a count. The lane body sits on a 2%-black wash so cards read against it; each card is white with a `#e6e6e6` bottom hairline. Empty lanes render a dashed "nothing here / + add" body.

### Callout Box
Inline message, 1px border, no fill except one case. Error is a red border with black body text and red `<b>`; warning (mid-flight, blue) adds a 5% blue wash; note is an edge border with label-grey text. A callout stays until it is resolved or dismissed — a partial save is not a toast.

### Navigation — the section rail
The tech card's left rail is the reference pattern: a sticky 150px column of uppercase 11px entries, active carrying bold ink and inactive label grey. A 14px square checkbox glyph per entry doubles as the completion signal (filled ink with `✓` when the section has data), which is why there is no separate progress bar. Below `lg` the rail becomes a horizontal scroll strip with the active state moving to a 2px bottom rule.

## 6. Do's and Don'ts

### Do:
- **Do** build every screen out of white blocks (`border border-borderColor bg-bgColor p-4`) sitting on the grey ground, separated by a 24px gutter.
- **Do** reach for `SectionHeader` / `GroupLabel` / `Row` / `RowTotal` to express hierarchy. Four ruled weights, in that order, cover every case.
- **Do** keep `#cccccc` on the outside of boxes and `#e6e6e6` on the inside between rows.
- **Do** fill a bordered block with white. Always.
- **Do** write the `question` clause on section headers, so a block says what it is for and not only what it is called.
- **Do** use `src/ui` primitives (`Text`, `Button`, `Pill`, `Chip`, `Row`, `StatGrid`, `CalloutBox`) instead of hand-rolling `div` + Tailwind. Type sizes, tracking and tabular numerals are baked in there on purpose.
- **Do** mark a `DataTable` column that holds words rather than digits with `data-align="left"` on **both** its `th` and its `td`. Right alignment exists to line up decimal places; on a column of badges or prose it leaves the header at one edge of the cell and the content at the other, so the label sits over nothing. A `text-left` class on the cell does not work — the table's own `[&_th]:text-right` outranks it.
- **Do** render `—` for missing data. An empty strip that reads as zero cost is worse than one that admits it has nothing.
- **Do** pair every colour signal with a word or a glyph, so the UI survives monochrome and colour-blind reading.
- **Do** give every interactive control a visible `focus-visible` outline and honour `prefers-reduced-motion`.

### Don't:
- **Don't** paint `bg-bgColor` on a layout container, a page wrapper or a tab panel. It swallows the ground and deletes every divider on the screen at once.
- **Don't** nest a block inside a block. One border per logical block; a sub-section is a `GroupLabel` and a rule, never a second `border` + `bg` pair.
- **Don't** draw a `border-t` or an `<hr>` between two stacked blocks. The gutter is the divider.
- **Don't** ship a bordered box without a fill.
- **Don't** round anything. No `rounded-*`, no pill-shaped buttons, no circular avatars.
- **Don't** put a shadow on anything in the document flow. Modals, popovers and the dragged board card are the entire list.
- **Don't** use `textInactiveColor` (`#ccc`, ~1.6:1) for readable text. Secondary text is `labelColor` (`#666`, ~5.7:1). `#ccc` is for borders, disabled states and placeholders only.
- **Don't** introduce a second font family, a font size above 12px in ordinary UI, or a hand-written `letter-spacing`.
- **Don't** use colour decoratively. No categorical colour coding, no tinted section backgrounds, no accent-per-feature. Red / blue / green mean broken / mid-flight / done, and nothing else.
- **Don't** "fix" the blue warning tone to amber or orange. Mid-flight states are blue in this system by decision.
- **Don't** reproduce the anti-references from PRODUCT.md: *"rounded, pastel, card-heavy consumer SaaS dashboards (Notion/Linear-lite clones)"*, *"gradient accents, drop shadows, glassmorphism, playful illustration"*, or *"wizard-style over-explained flows"*.
- **Don't** use arbitrary z-index values. The semantic scale (sticky 20 / nav 45 / modal 50 / popover 60 / toast 70) covers every layer that exists.
