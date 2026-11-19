import { authoredInternalVertices } from '../../manifest/authored-internal';
import { AUTHORED_TEXT_HEIGHT_MM, AUTHORED_TEXT_LAYER } from '../../manifest/authored-text';
import type { AuthoredTextMark, IRText } from '../../types';
import { asciiText, txt } from '../../write/format';
import type { DxfGroup, DxfRead } from './dxf-types';
import { decodeTextValue } from './text';

export function readAuthoredTextMarks(
  read: DxfRead,
  group: DxfGroup,
  texts: readonly IRText[],
): AuthoredTextMark[] {
  const drawn = texts.filter((text) => text.layer === AUTHORED_TEXT_LAYER);
  const claimed = group.block ? read.meta.authoredTextByBlock?.get(group.block) ?? [] : [];
  if (!drawn.length && !claimed.length) return [];
  const { a, b, c, d, e, f } = group.transform;
  const invalid = () =>
    new Error(`The saved CAD text marks in ${group.block || 'the drawing'} changed.`);
  if (
    group.kind !== 'insert' ||
    drawn.length !== claimed.length ||
    read.meta.units.mmPerUnit !== 1 ||
    a !== 1 ||
    b !== 0 ||
    c !== 0 ||
    d !== 1
  )
    throw invalid();
  return claimed.map(({ anchor, text }, index) => {
    const mark = drawn[index]!;
    const coords = authoredInternalVertices([mark.anchor], { x: e, y: f });
    const written = decodeTextValue(read.meta.version === 'AC1009' ? asciiText(text) : txt(text));
    if (
      read.meta.textEntity[mark.id] !== 'TEXT' ||
      mark.src.block !== group.block ||
      mark.rotationDeg !== 0 ||
      mark.fontSizeMm !== AUTHORED_TEXT_HEIGHT_MM ||
      mark.text !== written ||
      coords[0] !== anchor[0] ||
      coords[1] !== anchor[1]
    )
      throw invalid();
    return { at: { ...mark.anchor }, text };
  });
}
