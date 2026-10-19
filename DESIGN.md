---
name: GRBPWR Admin
description: Brutalist monochrome control surface for store operators — white blocks on a grey ground, hierarchy drawn in rules.
colors:
  textColor: '#000000' # ink
  bgColor: '#ffffff' # block
  borderColor: '#cccccc' # edge
  labelColor: '#666666' # label
  hairline: '#e6e6e6' # rule
  pageBg: '#f2f2f2' # panel
  error: '#ff0000'
  highlightColor: '#311eee'
  success: '#0f7a34' # green
  warning: '#2323ff'
  overlay: 'rgba(0, 0, 0, 0.4)'
typography:
  fontSizes:
    textBaseSize: '12px'
    small: '12px'
    control: '11px'
    micro: '10px'
    nano: '9px'
    stat: '16px'
    reading: '16px'
    statBig: '22px'
    lg: '18px'
    giantSmall: '110px'
    giant: '200px'
  fontFamilies:
    sans: "'FeatureMono', 'Inter', 'Helvetica Neue', Arial, sans-serif"
    mono: "'FeatureMono', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace"
  fontWeights: {}
  letterSpacing:
    pill: '0.03em'
    label: '0.04em'
    group: '0.05em'
    section: '0.06em'
  lineHeights: {}
rounded: {}
spacing:
  gutter: '24px'
  block: '16px'
  stack: '10px'
components:
  block:
    backgroundColor: '{colors.block}'
    textColor: '{colors.ink}'
    rounded: '{rounded.none}'
    padding: '{spacing.block}'
  button-main:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.block}'
    typography: '{typography.body}'
    rounded: '{rounded.none}'
    padding: '10px 16px'
  button-main-hover:
    backgroundColor: '{colors.block}'
    textColor: '{colors.ink}'
  button-main-disabled:
    backgroundColor: '{colors.block}'
    textColor: '{colors.edge}'
  button-secondary:
    backgroundColor: '{colors.block}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.none}'
    padding: '4px 10px'
  button-secondary-hover:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.block}'
  input:
    backgroundColor: '{colors.block}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.none}'
    padding: '3px 7px'
    height: '22px'
  pill:
    backgroundColor: 'transparent'
    textColor: '{colors.label}'
    typography: '{typography.label}'
    rounded: '{rounded.none}'
    padding: '1px 7px'
  chip-selected:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.block}'
    typography: '{typography.label}'
    rounded: '{rounded.none}'
    padding: '1px 7px'
  stat-cell:
    backgroundColor: '{colors.block}'
    textColor: '{colors.ink}'
    typography: '{typography.stat}'
    rounded: '{rounded.none}'
    padding: '8px 10px'
  board-column-header:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.none}'
    padding: '4px 8px'
---

# Design System: GRBPWR Admin

<!-- design-sync:start primitives -->

## Primitives

| Export               | Primitive                          | Source                                      | Variants                                                                                                                                                                                                                                                                        | UI kit                               |
| -------------------- | ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Accordion            | Bordered collapsible block         | `src/ui/components/accordion.tsx`           | tone: default\|error                                                                                                                                                                                                                                                            | [view](/ui-kit#Accordion)            |
| AddDoor              | Dashed «+ noun» door after a list  | `src/ui/components/board.tsx`               | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#AddDoor)              |
| addDoorClass         | Dashed «+ noun» door after a list  | `src/ui/components/board.tsx`               | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#addDoorClass)         |
| Arrow                | Chevron arrow icon                 | `src/ui/icons/arrow.tsx`                    | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Arrow)                |
| Avatar               | Person initials circle             | `src/ui/components/avatar.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Avatar)               |
| AvatarPicker         | Person initials circle             | `src/ui/components/avatar.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#AvatarPicker)         |
| BackLink             | «← word» way back                  | `src/ui/components/button.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#BackLink)             |
| BarRow               | Horizontal bar chart row           | `src/ui/components/bar-row.tsx`             | tone: ink\|up\|down                                                                                                                                                                                                                                                             | [view](/ui-kit#BarRow)               |
| Board                | Kanban columns row                 | `src/ui/components/board.tsx`               | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Board)                |
| BoardCard            | Kanban columns row                 | `src/ui/components/board.tsx`               | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#BoardCard)            |
| BoardColumn          | Kanban columns row                 | `src/ui/components/board.tsx`               | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#BoardColumn)          |
| BoardEmpty           | Kanban columns row                 | `src/ui/components/board.tsx`               | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#BoardEmpty)           |
| buildMonthIndex      | Month to list offset index         | `src/ui/hooks/use-month-index.ts`           | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#buildMonthIndex)      |
| Button               | Clickable action, all styles       | `src/ui/components/button.tsx`              | variant: default\|simple\|simpleReverse\|simpleReverseWithBorder\|main\|secondary\|underline\|underlineReverse\|underlineWithColors\|strikeThrough · isLoading: true\|false · size: xs\|sm\|default\|lg\|giant                                                                  | [view](/ui-kit#Button)               |
| buttonVariants       | Clickable action, all styles       | `src/ui/components/button.tsx`              | variant: default\|simple\|simpleReverse\|simpleReverseWithBorder\|main\|secondary\|underline\|underlineReverse\|underlineWithColors\|strikeThrough · isLoading: true\|false · size: xs\|sm\|default\|lg\|giant                                                                  | [view](/ui-kit#buttonVariants)       |
| CalloutBox           | Inline message box                 | `src/ui/components/callout-box.tsx`         | tone: error\|warning\|note                                                                                                                                                                                                                                                      | [view](/ui-kit#CalloutBox)           |
| Canvas               | Drawing with numbered pins         | `src/ui/components/canvas.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Canvas)               |
| CheckboxCommon       | Checkbox                           | `src/ui/components/checkbox.tsx`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#CheckboxCommon)       |
| CheckboxField        | Form-bound checkbox                | `src/ui/form/fields/checkbox-field.tsx`     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#CheckboxField)        |
| ChecklistEditor      | Editable checklist with progress   | `src/ui/components/checklist-editor.tsx`    | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#ChecklistEditor)      |
| Chip                 | Interactive filter/toggle chip     | `src/ui/components/chip.tsx`                | selected: true\|false · tone: default\|error\|attention · dashed: true\|false                                                                                                                                                                                                   | [view](/ui-kit#Chip)                 |
| ChipRow              | Interactive filter/toggle chip     | `src/ui/components/chip.tsx`                | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#ChipRow)              |
| Close                | Close / remove ×                   | `src/ui/components/close.tsx`               | size: sm\|default                                                                                                                                                                                                                                                               | [view](/ui-kit#Close)                |
| Combobox             | Search-to-pick dropdown            | `src/ui/components/combobox.tsx`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Combobox)             |
| ComboField           | Free text + datalist suggestions   | `src/ui/form/fields/combo-field.tsx`        | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#ComboField)           |
| ConfirmationModal    | The one modal shell                | `src/ui/components/confirmation-modal.tsx`  | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#ConfirmationModal)    |
| CopyToClipboard      | Copy value on click                | `src/ui/components/copyToClipboard.tsx`     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#CopyToClipboard)      |
| DataTable            | Table grammar wrapper              | `src/ui/components/data-table.tsx`          | variant: list\|grid                                                                                                                                                                                                                                                             | [view](/ui-kit#DataTable)            |
| DatePicker           | Portalled date field               | `src/ui/components/date-picker.tsx`         | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#DatePicker)           |
| DateScrubber         | Date pill scroll handle (touch)    | `src/ui/components/date-scrubber.tsx`       | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#DateScrubber)         |
| DecimalField         | Form-bound decimal input           | `src/ui/form/fields/decimal-field.tsx`      | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#DecimalField)         |
| Drawer               | Right-docked side panel            | `src/ui/components/drawer.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Drawer)               |
| EmptyCell            | Table grammar wrapper              | `src/ui/components/data-table.tsx`          | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#EmptyCell)            |
| FieldsGroupContainer | Legacy collapsible field group     | `src/ui/components/fields-group.tsx`        | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#FieldsGroupContainer) |
| FoldCaret            | Disclosure caret glyph             | `src/ui/components/fold-caret.tsx`          | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#FoldCaret)            |
| Form                 | react-hook-form field scaffolding  | `src/ui/form/index.tsx`                     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Form)                 |
| FormControl          | react-hook-form field scaffolding  | `src/ui/form/index.tsx`                     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#FormControl)          |
| FormDescription      | react-hook-form field scaffolding  | `src/ui/form/index.tsx`                     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#FormDescription)      |
| FormField            | react-hook-form field scaffolding  | `src/ui/form/index.tsx`                     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#FormField)            |
| FormItem             | react-hook-form field scaffolding  | `src/ui/form/index.tsx`                     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#FormItem)             |
| FormLabel            | react-hook-form field scaffolding  | `src/ui/form/index.tsx`                     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#FormLabel)            |
| FormMessage          | react-hook-form field scaffolding  | `src/ui/form/index.tsx`                     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#FormMessage)          |
| GenericPopover       | Anchored popover shell             | `src/ui/components/popover.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#GenericPopover)       |
| GrbpwrMark           | Brand mark logo                    | `src/ui/icons/grbpwr-mark.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#GrbpwrMark)           |
| GroupLabel           | Sub-group divider inside block     | `src/ui/components/group-label.tsx`         | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#GroupLabel)           |
| HATCH                | Shape-keeping loading placeholders | `src/ui/components/skeleton.tsx`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#HATCH)                |
| HEADER_TEXT          | Section title on ink rule          | `src/ui/components/section-header.tsx`      | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#HEADER_TEXT)          |
| HeaderCount          | Section title on ink rule          | `src/ui/components/section-header.tsx`      | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#HeaderCount)          |
| HeaderNext           | Section title on ink rule          | `src/ui/components/section-header.tsx`      | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#HeaderNext)           |
| HeaderNote           | Section title on ink rule          | `src/ui/components/section-header.tsx`      | tone: ink\|attention\|mut\|warn\|ok                                                                                                                                                                                                                                             | [view](/ui-kit#HeaderNote)           |
| HeaderWarnings       | Block-header warnings door         | `src/ui/components/header-warnings.tsx`     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#HeaderWarnings)       |
| initials             | Person initials circle             | `src/ui/components/avatar.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#initials)             |
| Input                | Single-line text input             | `src/ui/components/input.tsx`               | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Input)                |
| InputField           | Form-bound text input              | `src/ui/form/fields/input-field.tsx`        | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#InputField)           |
| Loader               | Indeterminate loading bar          | `src/ui/components/loader.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Loader)               |
| Media                | Image/video in aspect box          | `src/ui/components/media.tsx`               | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Media)                |
| Overlay              | Bare scrim layer                   | `src/ui/components/overlay.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Overlay)              |
| Pill                 | Read-only status marker            | `src/ui/components/pill.tsx`                | tone: ok\|warn\|attention\|mut\|ink\|gap                                                                                                                                                                                                                                        | [view](/ui-kit#Pill)                 |
| Pin                  | Drawing with numbered pins         | `src/ui/components/canvas.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Pin)                  |
| Placeholder          | Hatched «empty here» surface       | `src/ui/components/placeholder.tsx`         | tone: default\|error                                                                                                                                                                                                                                                            | [view](/ui-kit#Placeholder)          |
| PLACEHOLDER_SURFACE  | Hatched «empty here» surface       | `src/ui/components/placeholder.tsx`         | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#PLACEHOLDER_SURFACE)  |
| placeholderClass     | Hatched «empty here» surface       | `src/ui/components/placeholder.tsx`         | tone: default\|error                                                                                                                                                                                                                                                            | [view](/ui-kit#placeholderClass)     |
| PopoverContent       | Anchored popover shell             | `src/ui/components/popover.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#PopoverContent)       |
| Progress             | Determinate 4px progress rail      | `src/ui/components/progress.tsx`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Progress)             |
| RatioGlyph           | Aspect ratio drawn as rect         | `src/ui/components/ratio-glyph.tsx`         | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#RatioGlyph)           |
| RichTextField        | Rich text field                    | `src/ui/form/fields/rich-text-field.tsx`    | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#RichTextField)        |
| Row                  | Label–value line with hairline     | `src/ui/components/row.tsx`                 | tone: default\|error\|label                                                                                                                                                                                                                                                     | [view](/ui-kit#Row)                  |
| RowTotal             | Label–value line with hairline     | `src/ui/components/row.tsx`                 | tone: default\|error\|label                                                                                                                                                                                                                                                     | [view](/ui-kit#RowTotal)             |
| scrubLabel           | Date pill scroll handle (touch)    | `src/ui/components/date-scrubber.tsx`       | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#scrubLabel)           |
| Section              | The block: bordered white panel    | `src/ui/components/section.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Section)              |
| SectionHeader        | Section title on ink rule          | `src/ui/components/section-header.tsx`      | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SectionHeader)        |
| SectionStack         | The block: bordered white panel    | `src/ui/components/section.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SectionStack)         |
| SegmentedField       | Form-bound segmented choice        | `src/ui/form/fields/segmented-field.tsx`    | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SegmentedField)       |
| Select               | Dropdown pick from list            | `src/ui/components/select.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Select)               |
| SelectContent        | Dropdown pick from list            | `src/ui/components/select.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SelectContent)        |
| SelectField          | Form-bound select                  | `src/ui/form/fields/select-field.tsx`       | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SelectField)          |
| SelectItem           | Dropdown pick from list            | `src/ui/components/select.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SelectItem)           |
| Selector             | Labelled radix select (legacy)     | `src/ui/components/selector.tsx`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Selector)             |
| SelectTrigger        | Dropdown pick from list            | `src/ui/components/select.tsx`              | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SelectTrigger)        |
| SideRail             | Sticky left nav column             | `src/ui/components/side-rail.tsx`           | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SideRail)             |
| SideRailGroup        | Sticky left nav column             | `src/ui/components/side-rail.tsx`           | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SideRailGroup)        |
| SideRailItem         | Sticky left nav column             | `src/ui/components/side-rail.tsx`           | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SideRailItem)         |
| SideRailLayout       | Sticky left nav column             | `src/ui/components/side-rail.tsx`           | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SideRailLayout)       |
| SkeletonBlocks       | Shape-keeping loading placeholders | `src/ui/components/skeleton.tsx`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SkeletonBlocks)       |
| SkeletonLine         | Shape-keeping loading placeholders | `src/ui/components/skeleton.tsx`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SkeletonLine)         |
| SkeletonRows         | Shape-keeping loading placeholders | `src/ui/components/skeleton.tsx`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#SkeletonRows)         |
| Stat                 | KPI grid of cells                  | `src/ui/components/stat-grid.tsx`           | tone: default\|up\|down                                                                                                                                                                                                                                                         | [view](/ui-kit#Stat)                 |
| StatGrid             | KPI grid of cells                  | `src/ui/components/stat-grid.tsx`           | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#StatGrid)             |
| Stepper              | Lifecycle as words                 | `src/ui/components/stepper.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Stepper)              |
| Text                 | Typography: every piece of text    | `src/ui/components/text.tsx`                | variant: default\|error\|selected\|uppercase\|underlined\|underLineWithColor\|strikethrough\|strileTroughInactive\|inactive\|label\|errorLabel · size: default\|giant\|small\|control\|micro\|nano\|stat\|statBig\|large\|reading · tracking: none\|pill\|label\|group\|section | [view](/ui-kit#Text)                 |
| Textarea             | Auto-growing text area             | `src/ui/components/text-area.tsx`           | variant: default\|secondary                                                                                                                                                                                                                                                     | [view](/ui-kit#Textarea)             |
| TextareaField        | Form-bound textarea                | `src/ui/form/fields/textarea-field.tsx`     | variant: default\|secondary                                                                                                                                                                                                                                                     | [view](/ui-kit#TextareaField)        |
| Tile                 | Auto-fill grid of cards            | `src/ui/components/tiles.tsx`               | tone: default\|error                                                                                                                                                                                                                                                            | [view](/ui-kit#Tile)                 |
| TILE_CORNER          | Tile corner skin tokens            | `src/ui/components/tile-skin.ts`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#TILE_CORNER)          |
| TILE_QUIET           | Tile corner skin tokens            | `src/ui/components/tile-skin.ts`            | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#TILE_QUIET)           |
| Tiles                | Auto-fill grid of cards            | `src/ui/components/tiles.tsx`               | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Tiles)                |
| ToggleField          | Form-bound switch                  | `src/ui/form/fields/toggle-field.tsx`       | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#ToggleField)          |
| ToggleGroupField     | Form-bound multi-switch list       | `src/ui/form/fields/toggle-group-field.tsx` | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#ToggleGroupField)     |
| ToggleSwitch         | On/off switch with label           | `src/ui/components/toggle-switch.tsx`       | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#ToggleSwitch)         |
| Toolbar              | Bordered control strip             | `src/ui/components/toolbar.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Toolbar)              |
| ToolbarSpacer        | Bordered control strip             | `src/ui/components/toolbar.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#ToolbarSpacer)        |
| Tooltip              | Hover hint                         | `src/ui/components/tooltip.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#Tooltip)              |
| TooltipProvider      | Hover hint                         | `src/ui/components/tooltip.tsx`             | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#TooltipProvider)      |
| TotalRow             | Table grammar wrapper              | `src/ui/components/data-table.tsx`          | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#TotalRow)             |
| useFormField         | react-hook-form field scaffolding  | `src/ui/form/index.tsx`                     | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#useFormField)         |
| useMonthIndex        | Month to list offset index         | `src/ui/hooks/use-month-index.ts`           | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#useMonthIndex)        |
| ViewSwitch           | Exclusive view switch              | `src/ui/components/view-switch.tsx`         | —                                                                                                                                                                                                                                                                               | [view](/ui-kit#ViewSwitch)           |
| WaterfallRow         | Horizontal bar chart row           | `src/ui/components/bar-row.tsx`             | kind: pos\|neg\|final                                                                                                                                                                                                                                                           | [view](/ui-kit#WaterfallRow)         |

<!-- design-sync:end primitives -->

<!-- design-sync:start tokens -->

## Tokens

| Kind           | Token                    | Value                                                                 | Class                 |
| -------------- | ------------------------ | --------------------------------------------------------------------- | --------------------- |
| color          | `--color-textColor`      | `#000000`                                                             | `text-textColor`      |
| color          | `--color-bgColor`        | `#ffffff`                                                             | `bg-bgColor`          |
| color          | `--color-borderColor`    | `#cccccc`                                                             | `border-borderColor`  |
| color          | `--color-labelColor`     | `#666666`                                                             | `text-labelColor`     |
| color          | `--color-hairline`       | `#e6e6e6`                                                             | `border-hairline`     |
| color          | `--color-pageBg`         | `#f2f2f2`                                                             | `bg-pageBg`           |
| color          | `--color-error`          | `#ff0000`                                                             | `text-error`          |
| color          | `--color-highlightColor` | `#311eee`                                                             | `text-highlightColor` |
| color          | `--color-success`        | `#0f7a34`                                                             | `text-success`        |
| color          | `--color-warning`        | `#2323ff`                                                             | `text-warning`        |
| color          | `--color-overlay`        | `rgba(0, 0, 0, 0.4)`                                                  | `bg-overlay`          |
| font size      | `--text-textBaseSize`    | `12px`                                                                | `text-textBaseSize`   |
| font size      | `--text-small`           | `12px`                                                                | `text-small`          |
| font size      | `--text-control`         | `11px`                                                                | `text-control`        |
| font size      | `--text-micro`           | `10px`                                                                | `text-micro`          |
| font size      | `--text-nano`            | `9px`                                                                 | `text-nano`           |
| font size      | `--text-stat`            | `16px`                                                                | `text-stat`           |
| font size      | `--text-reading`         | `16px`                                                                | `text-reading`        |
| font size      | `--text-statBig`         | `22px`                                                                | `text-statBig`        |
| font size      | `--text-lg`              | `18px`                                                                | `text-lg`             |
| font size      | `--text-giantSmall`      | `110px`                                                               | `text-giantSmall`     |
| font size      | `--text-giant`           | `200px`                                                               | `text-giant`          |
| font family    | `--font-family-sans`     | `'FeatureMono', 'Inter', 'Helvetica Neue', Arial, sans-serif`         | `font-family-sans`    |
| font family    | `--font-family-mono`     | `'FeatureMono', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace` | `font-family-mono`    |
| letter spacing | `--tracking-pill`        | `0.03em`                                                              | `tracking-pill`       |
| letter spacing | `--tracking-label`       | `0.04em`                                                              | `tracking-label`      |
| letter spacing | `--tracking-group`       | `0.05em`                                                              | `tracking-group`      |
| letter spacing | `--tracking-section`     | `0.06em`                                                              | `tracking-section`    |
| spacing        | `--spacing-gutter`       | `24px`                                                                | `gap-gutter`          |
| spacing        | `--spacing-block`        | `16px`                                                                | `gap-block`           |
| spacing        | `--spacing-stack`        | `10px`                                                                | `gap-stack`           |

<!-- design-sync:end tokens -->

## 1. Overview

**Creative north star: "The Machine Console"**

This is a dense operator tool: `textColor` on `bgColor`, hard rules, square controls, and literal
glyphs. `pageBg` is the page canvas; `bgColor` is the material of a logical block. The 24px
`gutter` between blocks exposes `pageBg` and acts as the divider.

- One `borderColor` outline per logical block. A bordered block also has a `bgColor` fill.
- A block never contains another block. Use the rule ladder inside it.
- Colour carries state, not decoration, and every colour signal also has a word or glyph.
- Ordinary UI uses the named type scale and has no inline shadow or decorative radius.

## 2. Colors

Use the token name in prose and the matching Tailwind class in code.

| Token name       | Value                | Typical class                  | Contract                                           |
| ---------------- | -------------------- | ------------------------------ | -------------------------------------------------- |
| `textColor`      | `#000000`            | `text-textColor`               | Body text, headings, selected fills, strongest rules |
| `bgColor`        | `#ffffff`            | `bg-bgColor`                   | Blocks, inputs, menus, and other white surfaces    |
| `pageBg`         | `#f2f2f2`            | `bg-pageBg`                    | Canvas, header strips, tracks, and inactive surfaces |
| `borderColor`    | `#cccccc`            | `border-borderColor`, `text-borderColor` | Outer outlines, disabled text, and placeholders |
| `hairline`       | `#e6e6e6`            | `border-hairline`, `bg-hairline` | Inner rules and progress rails                   |
| `labelColor`     | `#666666`            | `text-labelColor`              | Readable secondary text                            |
| `overlay`        | `rgba(0, 0, 0, 0.4)` | `bg-overlay`                   | Modal and drawer scrims                            |
| `error`          | `#ff0000`            | `text-error`, `border-error`   | Broken, missing, blocking, destructive             |
| `warning`        | `#2323ff`            | `text-warning`, `bg-warning`   | Mid-flight, unsaved, stale, or needing a human     |
| `success`        | `#0f7a34`            | `text-success`, `bg-success`   | Done, approved, in stock, or under budget          |
| `highlightColor` | `#311eee`            | `text-highlightColor`          | Links and the single highlight accent              |

`error`, `warning`, `success`, and `highlightColor` are the semantic accents. `warning` is
deliberately blue.

`Placeholder` and `Skeleton*` use the same `#f4f4f4` / `#ececec` hatch to distinguish empty or
loading space from an unpainted surface. Technical drawings currently use local `#dedede` fills
and `#8a8a8a` strokes; these become tokens later.

Tailwind's default palette still exists, but it is not part of this system. Ordinary UI uses the
named tokens above.

### Rules

- `pageBg` is the canvas and the shared neutral fill for headers, tracks, and inactive surfaces.
- A `borderColor` outline always encloses a `bgColor` surface.
- `borderColor` is the outer rule and `hairline` is the inner rule. Do not swap them.
- Semantic colour never acts alone and is not used as decoration or category colour.

## 3. Typography

`font-family-sans` is the default FeatureMono-first stack. `font-family-mono` is the
FeatureMono-first technical stack used by codes and imported data. Neither introduces a display
face.

| Role            | Token / utility                      | Use                                            |
| --------------- | ------------------------------------ | ---------------------------------------------- |
| Body            | `textBaseSize` / `text-textBaseSize` | 12px values, cells, and running text           |
| Deprecated body | `small` / `text-small`               | 12px compatibility alias; do not add new uses  |
| Control         | `control` / `text-control`           | 11px tabs, rails, and option labels            |
| Label           | `micro` / `text-micro`               | 10px chips, buttons, pills, headers, and hints |
| Nano            | `nano` / `text-nano`                 | 9px badges, pin numbers, and band labels       |
| Stat            | `stat` / `text-stat`                 | 16px KPI values                                |
| Large stat      | `statBig` / `text-statBig`           | 22px emphasis inside stat surfaces             |
| Headline        | `lg` / `text-lg`                     | 18px page title                                |
| Compact display | `giantSmall` / `text-giantSmall`     | 110px login or hero display                    |
| Display         | `giant` / `text-giant`               | 200px login or hero display                    |

Section titles are bold 12px text with `tracking-section`; labels use the appropriate tracking
token. Type roles such as title and label are compositions, not separate size tokens.

### Rules

- Ordinary UI tops out at 12px except for page headlines and stat/display roles.
- Three surfaces are 16px, for a physical reason: the public QR pages `/p/:token` and `/r/:token`
  (read at arm's length on a phone, no pinch-zoom) and the email rich-text canvas (customer prose).
  Do not add a fourth.
- Letter spacing comes from `tracking-pill`, `tracking-label`, `tracking-group`, or
  `tracking-section`. Outside `src/ui` and the print surface, do not write px font sizes or tracking
  by hand.
- Uppercase marks short labels and controls. Sentences and hints remain sentence case.

## 4. Elevation

Document-flow surfaces are flat. The only elevation tokens are:

- `--shadow-modal`: `ConfirmationModal`, `Drawer`, and modal dialog surfaces.
- `--shadow-popover`: `GenericPopover`, `DatePicker`, copy feedback, and entity/material picker
  panels that opt into the popover surface.

`Select`, `Combobox`, and `Tooltip` do not have a shadow. Nothing else gets one.

### Floating surfaces

| Surface                       | Frame               | Shadow             | Layer         |
| ----------------------------- | ------------------- | ------------------ | ------------- |
| `ConfirmationModal`, `Drawer` | `textColor`         | `--shadow-modal`   | `--z-modal`   |
| `GenericPopover`              | `textColor`         | `--shadow-popover` | `--z-popover` |
| `DatePicker`                  | `borderColor`       | `--shadow-popover` | `--z-popover` |
| `Select`, `Combobox`          | `borderColor`       | none               | `--z-popover` |
| `Tooltip`                     | `borderColor`       | none               | `--z-popover` |

`ConfirmationModal` is the modal shell: `bgColor`, a `textColor` frame, a `pageBg` header,
scrolling body, ruled footer, and `sm` / `md` / `lg` widths. `Drawer` uses the same anatomy at the
right edge.

### Z-index

Use semantic variables across page layers:

`--z-sticky` 20 < `--z-dock` 40 < `--z-nav` 45 < `--z-modal` 50 < `--z-popover` 60 <
`--z-toast` 70.

Values from 0 through 20 may be local to an explicitly isolated stacking context. Do not use an
arbitrary value to cross page layers.

### Motion

- Navigation menus use a 150ms open / 120ms close drop; drawers use a 180ms open / 140ms close
  slide.
- Media viewers and file readers crossfade in 160ms and out in 130ms; the media stage enters in
  200ms. Composition swaps and annotation spot rings enter in 150ms.
- `PictureBusy` uses 1.8s scan and 2.4s wipe loops to distinguish read from cut work. Selected
  annotation callouts use the 1.6s breathing halo.
- `prefers-reduced-motion` removes the transition or leaves an equivalent static state. The
  breathing halo is also omitted from print.

All ordinary controls and surfaces are square. A circle is allowed only when the circle is the
sign: `Avatar`, annotation pins, and equivalent compact marker controls.

## 5. Components

The generated catalog above is the closed primitive list. `/ui-kit#Name` is the live reference for
each primitive. Outside `src/ui`, import catalog entries only from `ui`. A new primitive needs the
owner's approval and a `[primitive-ok]` commit marker. Feature components and compositions live
with their feature, outside `src/ui`.

### Neighbours

How blocks sit next to each other. Live samples: [/ui-kit#neighbours](/ui-kit#neighbours).

1. **Under.** Blocks are siblings in `SectionStack`, 24px `gutter` apart. Nothing is drawn in the gap: no margin, `<hr>` or `border-b`.
2. **Beside.** `SectionStack row` (`lg:flex-row gap-gutter`). Two outlines never touch. *(rule, not linted)*
3. **In: never.** Structure inside a block is `GroupLabel` + `Row`, never a nested `Section`. *(rule, not linted)*
4. **Own surfaces are siblings.** `StatGrid`, `Tiles`, `Board` and preview iframes sit in the stack next to blocks, never inside a `Section`. `DataTable` is not a surface; it lives inside a block. Modals, drawers and popovers float outside the flow.
5. **Toolbar** is its own strip in the stack, directly above what it controls, the same 24px away.
6. **Inside a block:** 16px `block` padding, 10px `stack` between children. Header actions are underlined words; one main action per block.
7. **Page edge:** the shell keeps 10px (`px-2.5`) to the first block. The ground (`pageBg`) shows only in gaps.
8. **Warnings** live in the block they concern: `! N` in its header (`HeaderWarnings`) plus red text. A free `CalloutBox` between blocks is old debt (3 sites). *(rule, not linted)*

### Blocks and headers

`Section` is one logical block: `bgColor`, a `borderColor` outline, 16px `block` padding, and a
10px `stack` between children. `SectionStack` separates sibling blocks with the 24px `gutter`.
`Section` can collapse to one header row; `FoldCaret` is the shared disclosure mark.

`SectionHeader` owns the 2px `textColor` rule. Its `question` clause is optional.
`HeaderNote`, `HeaderCount`, and `HeaderNext` provide quiet header metadata; `HeaderWarnings`
keeps `! N warnings` and its doors in the header rather than the body. A hand-drawn `!` glyph,
`` `! ${n} blocking` `` or a red problem count fails `design/no-hand-header-warnings`.

Inside a block, the rule ladder is fixed:

| Level         | Rule                        | Primitive       |
| ------------- | --------------------------- | --------------- |
| Block title   | 2px `textColor` below       | `SectionHeader` |
| Sub-group     | 1px `borderColor` below     | `GroupLabel`    |
| List row      | 1px `hairline` between rows | `Row`           |
| Closing total | 1px `textColor` above       | `RowTotal`      |

**Between rows, never under the last.** A ruled list ends in air: the last row has no bottom rule —
the block outline or the next non-row closes it. A total draws its ink rule above itself and the row
before it drops its hairline. `Row`/`RowTotal`, `DataTable`/`TotalRow` do this themselves; a
hand-rolled list uses `divide-y divide-hairline` or `last:border-b-0`.

The final ordinary row has no bottom rule. `Row` / `RowTotal` and `DataTable` / `TotalRow`
implement this. Feature-local row helpers follow the same rule but are not primitives.

### Buttons

Variant and size are independent.

- `main` uses a `textColor` fill, `bgColor` text, and a `textColor` frame. It inverts on hover.
- `secondary` is transparent with a `borderColor` frame and `textColor` text. It fills
  `textColor` on hover.
- Disabled `main` and `secondary` buttons become `bgColor` outlines with
  `borderColor` text and frame.
- `xs` and `sm` are 10px uppercase sizes for dense rows and panels. The default is
  `size='default'`: 12px with no padding added by the size. `lg` adds 10px / 16px padding at 12px
  for page actions.

### Pills and Chips

A `Pill` is read-only; a `Chip` is interactive.

- `Pill` has a transparent background and matching border/text tones: `ok` uses `success`, `warn`
  uses `error`, `attention` uses `warning`, `mut` uses `borderColor` / `labelColor`, and `ink` uses
  `textColor`. `gap` is the dashed `mut` treatment for something not present yet.
- `Chip` rests on `bgColor` with a `borderColor` frame and `labelColor` text. Selection fills
  `textColor`; `error` and `attention` use their semantic tokens. `quiet` removes the frame for
  block and group headers.

### Inputs and Selects

- `Input`, `Select`, and `Combobox` use a 1px `borderColor` frame, `bgColor` fill, 22px minimum
  height, 3px / 7px padding, and 12px text. `Textarea` has a 44px minimum and auto-grows by
  default.
- Focus changes the frame to `textColor`. `aria-invalid` changes it to `error`; the primitive owns
  this styling, not the screen or form wrapper.
- Use the floating-surface table above for dropdown frames and shadows.

### Stat Grid

`StatGrid` fills `bgColor` once at the container and divides cells with `borderColor`; cells remain
white. `Stat` is a label / value / sub triple with `success` and `error` as the only tones. Missing
data renders `—`, never `0`.

### Board (kanban / fulfilment lanes)

`Board` is a horizontal row of `BoardColumn` surfaces. A column has a `borderColor` outline and
`bgColor` fill; its header uses `pageBg`. `BoardCard` has a full `borderColor` frame, not only
a bottom rule. `BoardEmpty` is the dashed empty/add door.

### Callout Box

`CalloutBox` uses 10px horizontal and 8px vertical padding. `error` has an `error` frame with
`textColor` body copy; `warning` has `warning` text, frame, and a 5% `warning` wash; `note` has a
`borderColor` frame and `labelColor` text. A persistent problem is a callout, not a toast.

### Tables and compact data

`DataTable` owns scrolling, tabular numbers, right-aligned numeric columns, `borderColor` headers,
and `hairline` body rows. Put `data-align="left"` on both `th` and `td` for a word column.
`TotalRow` closes with a `textColor` rule above; `EmptyCell` renders `—`. The `grid` variant frames
every cell without adding a first-column fill. An absent value in a table cell, `Row` value or
`Stat` value is `<EmptyCell />`; a literal `'—'`, `'-'` or `'n/a'` there fails
`design/no-hand-empty-cell` (print documents keep their own dash).

`BarRow` and `WaterfallRow` use `pageBg` with `textColor`, `success`, or `error` fills. `Stepper`
shows a lifecycle as words and `›`, not as a percentage.

### Repeated and transient surfaces

- `Tiles` / `Tile` are the auto-fill visual picker. Tile corner/menu marks come from
  `TILE_CORNER` and `TILE_QUIET`.
- `Placeholder` marks empty space with the hatch. `SkeletonLine`, `SkeletonRows`, and
  `SkeletonBlocks` keep the shape of the result while it loads.
- `Toolbar` is the bordered control strip; its sticky form uses `pageBg`. `ViewSwitch` is the
  exclusive view selector.
- `Accordion` is a bordered `bgColor` surface with a white header and `FoldCaret`.

### Navigation and shell

`SideRail` is a 150px bordered `bgColor` rail by default. `SideRailItem` supports selected, count,
badge, and completion states. `HeaderNext` and feature rails use `›` for the next door. The tech
card's sticky responsive rail and the desktop/mobile top navigation are feature or shell
compositions outside `src/ui`.

The shell `SnackBar` is also outside the primitive catalog. It is one inverted `textColor` column
with internal rules, not a stack of separately framed cards.

## 6. Print documents

Print documents are a separate physical surface. The exact scope is the `lint:print` list in
`package.json`:

- `src/components/managers/print`
- `src/components/managers/tech-card/components/tech-pack-document.tsx`
- `src/components/managers/tech-card/print-page.tsx`
- `src/components/managers/production-runs/components/run-pack-document.tsx`
- `src/components/managers/production-runs/print-page.tsx`

These paths may use local hex colours and px sizes for paper geometry, callouts, swatches, and
preview treatment. No other path inherits that exemption. Under print media, the page becomes
`bgColor` and `hairline` is promoted to `borderColor` so rules survive on paper.

## 7. Enforcement

`yarn lint:design` is a ratchet: existing debt may remain at its baseline, but new design
violations fail. Fix the feature or change the token, this document, and the live UI kit together
with the owner's approval.

- Import primitives only from `ui`; do not deep-import their files.
- Do not add a primitive or a file under `src/ui` without owner approval and `[primitive-ok]`.
- Do not hand-roll blocks, type sizes, tracking, colour, radius, shadow, or cross-layer z-index.
- Preserve visible focus behavior and a reduced-motion equivalent when changing an interaction.
