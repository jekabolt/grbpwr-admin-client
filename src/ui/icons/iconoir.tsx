import arrowLeft from 'iconoir/icons/regular/arrow-left.svg?raw';
import bold from 'iconoir/icons/regular/bold.svg?raw';
import code from 'iconoir/icons/regular/code.svg?raw';
import eye from 'iconoir/icons/regular/eye.svg?raw';
import italic from 'iconoir/icons/regular/italic.svg?raw';
import link from 'iconoir/icons/regular/link.svg?raw';
import list from 'iconoir/icons/regular/list.svg?raw';
import mediaImage from 'iconoir/icons/regular/media-image.svg?raw';
import numberedListLeft from 'iconoir/icons/regular/numbered-list-left.svg?raw';
import page from 'iconoir/icons/regular/page.svg?raw';
import pageSearch from 'iconoir/icons/regular/page-search.svg?raw';
import quote from 'iconoir/icons/regular/quote.svg?raw';
import table from 'iconoir/icons/regular/table.svg?raw';
import textSize from 'iconoir/icons/regular/text-size.svg?raw';
import xmark from 'iconoir/icons/regular/xmark.svg?raw';
import check from 'iconoir/icons/regular/check.svg?raw';
import navArrowDown from 'iconoir/icons/regular/nav-arrow-down.svg?raw';
import sortDown from 'iconoir/icons/regular/sort-down.svg?raw';
import editPencil from 'iconoir/icons/regular/edit-pencil.svg?raw';
import navArrowLeft from 'iconoir/icons/regular/nav-arrow-left.svg?raw';
import navArrowRight from 'iconoir/icons/regular/nav-arrow-right.svg?raw';
import pin from 'iconoir/icons/regular/pin.svg?raw';
import plus from 'iconoir/icons/regular/plus.svg?raw';
import search from 'iconoir/icons/regular/search.svg?raw';
import viewColumns3 from 'iconoir/icons/regular/view-columns-3.svg?raw';
import viewGrid from 'iconoir/icons/regular/view-grid.svg?raw';

import { cn } from 'lib/utility';

/**
 * The iconoir set (owner: «иконки мы берем отсюда … iconoir … сам ничего не добавляй»). Only the
 * icons a screen asks for are listed; add a name here when a screen needs one — never a drawing of
 * our own. The SVGs come from the package as text (`?raw`, no svgr) and are inlined, so `stroke`
 * is `currentColor` and the icon takes the text colour.
 */
const ICONS = {
  'arrow-left': arrowLeft,
  'edit-pencil': editPencil,
  'nav-arrow-left': navArrowLeft,
  'nav-arrow-right': navArrowRight,
  pin,
  plus,
  search,
  'view-columns-3': viewColumns3,
  'view-grid': viewGrid,
  // Tasks screen: the description's style tiles and the dropdown's close.
  bold,
  code,
  eye,
  italic,
  link,
  list,
  'media-image': mediaImage,
  'numbered-list-left': numberedListLeft,
  page,
  'page-search': pageSearch,
  quote,
  table,
  'text-size': textSize,
  xmark,
  // Taskboard: save a typed board, the people filter's fold, a column's order.
  check,
  'nav-arrow-down': navArrowDown,
  'sort-down': sortDown,
} as const;

export type IconoirName = keyof typeof ICONS;

/** Strip the fixed 24px size; set the stroke the caller asks for (thin icons at 9px vanish). */
function prepare(svg: string, strokeWidth?: number) {
  let out = svg.replace(/\s(width|height)="24"/g, '');
  if (strokeWidth != null)
    out = out.replace(/stroke-width="[\d.]+"/, `stroke-width="${strokeWidth}"`);
  return out.replace(
    '<svg',
    '<svg aria-hidden="true" focusable="false" width="100%" height="100%"',
  );
}

export function Iconoir({
  name,
  className,
  strokeWidth,
}: {
  name: IconoirName;
  /** Size it with `size-*`; colour with `text-*`. */
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <span
      aria-hidden='true'
      className={cn('inline-block size-4 shrink-0 [&>svg]:block', className)}
      dangerouslySetInnerHTML={{ __html: prepare(ICONS[name], strokeWidth) }}
    />
  );
}
