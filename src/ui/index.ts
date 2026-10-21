// The closed list of UI primitives. Outside src/ui, import them from here only:
//   import { Button, Text } from 'ui';
// Inside src/ui, files import each other by relative path, never from this barrel (no cycles).
// A new export here is a new primitive and needs the owner's OK.

/** @primitive Bordered collapsible block */
export { Accordion } from './components/accordion';
/** @primitive Dashed «+ noun» door after a list */
export { AddDoor, addDoorClass, type AddDoorShape } from './components/board';
/** @primitive Person initials circle */
export { Avatar, AvatarPicker, initials } from './components/avatar';
/** @primitive «← word» way back */
export { BackLink } from './components/button';
/** @primitive Horizontal bar chart row */
export { BarRow, WaterfallRow } from './components/bar-row';
/** @primitive Kanban columns row */
export { Board, BoardCard, BoardColumn, BoardEmpty } from './components/board';
/** @primitive Clickable action, all styles */
export { Button, buttonVariants, useDoneFlash } from './components/button';
/** @primitive Close / remove ×  */
export { Close } from './components/close';
/** @primitive Inline message box */
export { CalloutBox } from './components/callout-box';
/** @primitive Drawing with numbered pins */
export { Canvas, Pin } from './components/canvas';
/** @primitive Checkbox */
export { default as CheckboxCommon } from './components/checkbox';
/** @primitive Editable checklist with progress */
export { ChecklistEditor, type ChecklistItemLike } from './components/checklist-editor';
/** @primitive Interactive filter/toggle chip */
export { Chip, ChipRow } from './components/chip';
/** @primitive Search-to-pick dropdown */
export { Combobox, type ComboboxGroup, type ComboboxOption } from './components/combobox';
/** @primitive The one modal shell */
export { ConfirmationModal, type ModalWidth } from './components/confirmation-modal';
/** @primitive Copy value on click */
export { CopyToClipboard } from './components/copyToClipboard';
/** @primitive Table grammar wrapper */
export { DataTable, EmptyCell, TotalRow } from './components/data-table';
/** @primitive Portalled date field */
export { DatePicker, DateRangePicker } from './components/date-picker';
/** @primitive Date pill scroll handle (touch) */
export { DateScrubber, scrubLabel, type DateScrubberProps } from './components/date-scrubber';
/** @primitive Month to list offset index */
export {
  buildMonthIndex,
  useMonthIndex,
  type MonthIndex,
  type ScrubMonth,
} from './hooks/use-month-index';
/** @primitive Right-docked side panel */
export { Drawer } from './components/drawer';
/** @primitive Legacy collapsible field group */
export { default as FieldsGroupContainer } from './components/fields-group';
/** @primitive Disclosure caret glyph */
export { FoldCaret } from './components/fold-caret';
/** @primitive Sub-group divider inside block */
export { GroupLabel } from './components/group-label';
/** @primitive Block-header warnings door */
export {
  HeaderWarnings,
  type HeaderWarning,
  type HeaderWarningAction,
} from './components/header-warnings';
/** @primitive Single-line text input */
export { default as Input, type InputProps } from './components/input';
/** @primitive Indeterminate loading bar */
export { Loader } from './components/loader';
/** @primitive BlurHash-backed image */
export { BlurhashImage, type BlurhashImageProps } from './components/blurhash-image';
/** @primitive Image/video in aspect box */
export { default as Media } from './components/media';
/** @primitive Bare scrim layer */
export { Overlay } from './components/overlay';
/** @primitive Read-only status marker */
export { Pill } from './components/pill';
/** @primitive Hatched «empty here» surface */
export { Placeholder, PLACEHOLDER_SURFACE, placeholderClass } from './components/placeholder';
/** @primitive Anchored popover shell */
export { default as GenericPopover, PopoverContent } from './components/popover';
/** @primitive Determinate 4px progress rail */
export { Progress } from './components/progress';
/** @primitive Aspect ratio drawn as rect */
export { RatioGlyph } from './components/ratio-glyph';
/** @primitive Label–value line with hairline */
export { Row, RowTotal } from './components/row';
/** @primitive Section title on ink rule */
export {
  HEADER_TEXT,
  HeaderCount,
  HeaderNext,
  HeaderNote,
  SectionHeader,
  type HeaderNoteTone,
} from './components/section-header';
/** @primitive The block: bordered white panel */
export { Section, SectionStack } from './components/section';
/** @primitive Dropdown pick from list */
export { default as Select, SelectContent, SelectItem, SelectTrigger } from './components/select';
/** @primitive Labelled radix select (legacy) */
export { default as Selector } from './components/selector';
/** @primitive Sticky left nav column */
export { SideRail, SideRailGroup, SideRailItem, SideRailLayout } from './components/side-rail';
/** @primitive Shape-keeping loading placeholders */
export { HATCH, SkeletonBlocks, SkeletonLine, SkeletonRows } from './components/skeleton';
/** @primitive KPI grid of cells */
export { Stat, StatGrid } from './components/stat-grid';
/** @primitive Lifecycle as words */
export { Stepper, type Step } from './components/stepper';
/** @primitive Auto-growing text area */
export { default as Textarea, type TextareaProps } from './components/text-area';
/** @primitive Typography: every piece of text */
export { default as Text } from './components/text';
/** @primitive Tile corner skin tokens */
export { TILE_CORNER, TILE_QUIET } from './components/tile-skin';
/** @primitive Auto-fill grid of cards */
export { Tile, Tiles } from './components/tiles';
/** @primitive On/off switch with label */
export { ToggleSwitch } from './components/toggle-switch';
/** @primitive Bordered control strip */
export { Toolbar, ToolbarSpacer } from './components/toolbar';
/** @primitive Hover hint */
export { default as Tooltip, TooltipProvider } from './components/tooltip';
/** @primitive Ghost row with undo */
export { UndoRow } from './components/undo-row';
/** @primitive Exclusive view switch */
export { ViewSwitch, type ViewSwitchOption } from './components/view-switch';

/** @primitive react-hook-form field scaffolding */
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from './form';
/** @primitive Form-bound checkbox */
export { default as CheckboxField } from './form/fields/checkbox-field';
/** @primitive Free text + datalist suggestions */
export { default as ComboField } from './form/fields/combo-field';
/** @primitive Form-bound decimal input */
export { default as DecimalField } from './form/fields/decimal-field';
/** @primitive Form-bound text input */
export { default as InputField } from './form/fields/input-field';
/** @primitive Rich text field */
export { RichTextField } from './form/fields/rich-text-field';
/** @primitive Form-bound segmented choice */
export { default as SegmentedField } from './form/fields/segmented-field';
/** @primitive Form-bound select */
export { default as SelectField } from './form/fields/select-field';
/** @primitive Form-bound textarea */
export { default as TextareaField, type TextareaCornerApi } from './form/fields/textarea-field';
/** @primitive Form-bound switch */
export { default as ToggleField } from './form/fields/toggle-field';
/** @primitive Form-bound multi-switch list */
export { default as ToggleGroupField } from './form/fields/toggle-group-field';

/** @primitive Chevron arrow icon */
export { Arrow } from './icons/arrow';
/** @primitive Brand mark logo */
export { GrbpwrMark } from './icons/grbpwr-mark';
/** @primitive Icon set */
export {
  ArchiveIcon,
  ArrowRightIcon,
  ChatBubbleIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClipboardCopyIcon,
  ClockIcon,
  CopyIcon,
  DotsHorizontalIcon,
  DownloadIcon,
  EnterFullScreenIcon,
  ExternalLinkIcon,
  EyeNoneIcon,
  Half2Icon,
  InfoCircledIcon,
  MinusIcon,
  Pencil1Icon,
  PlusIcon,
  RotateCounterClockwiseIcon,
  TrashIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons';
