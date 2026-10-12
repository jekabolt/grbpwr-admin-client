// PASSPORT (c) — a layer / group name that says what its lines are. The NAME AS A WHOLE must be the
// word (anchored, after the decoding the SVG adapter already did: `CUT_x5F_LINE` → `CUT_LINE`), so a
// layer "Cut lines (old)", "cutting layout", "notes about the seam" or "Layer 1" says nothing. Only
// layer names: a word printed in the TEXT layer is never a layer word (PDF text is data and is
// read elsewhere, by the allowance grammar).

/** Lower case, separators (`_`, `-`, `.`, several spaces) → one space, a trailing copy number dropped. */
export function normLayerName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(?:copy\s*)?\d{1,2}$/, '')
    .trim();
}

// cut line, in the languages the corpus and the CAD tools speak
const CUT = [
  /^(?:cut|cutting)(?: ?(?:line|lines|contour|contours|outline|outlines|edge|edges))?$/,
  /^(?:outer )?cut ?line(?:s)?$/,
  /^schnitt ?(?:linie|linien|kante|kanten)$/,
  /^schnittkontur(?:en)?$/,
  /^(?:линия|линии|контур|контуры) кроя$/,
  /^крой$/,
  /^(?:ligne|lignes) de coupe$/,
  /^(?:linea|linee) di taglio$/,
  /^(?:línea|líneas|linea|lineas) de corte$/,
  /^snijlijn(?:en)?$/,
  /^(?:klippelinje|klippelinjer|skärlinje|skärlinjer)$/,
  /^(?:linia|linie) (?:cięcia|ciecia|kroju)$/,
];
// seam (sewing / stitching) line
const SEAM = [
  /^(?:seam|sew|sewing|stitch|stitching)(?: ?(?:line|lines))?$/,
  /^naht ?(?:linie|linien)$/,
  /^(?:линия|линии) (?:шва|швов|стачивания)$/,
  /^(?:ligne|lignes) de couture$/,
  /^(?:linea|linee) di cucitura$/,
  /^(?:línea|líneas|linea|lineas) de costura$/,
  /^naadlijn(?:en)?$/,
  /^(?:sømlinje|sømlinjer|sömlinje|sömlinjer)$/,
  /^(?:linia|linie) (?:szwu|szycia)$/,
];

/** 'cut' / 'seam' when the layer's whole name is that word, else null. */
export function layerOutlineWord(name: string | null | undefined): 'cut' | 'seam' | null {
  if (!name) return null;
  const n = normLayerName(name);
  if (!n || n.length > 40) return null;
  if (CUT.some((r) => r.test(n))) return 'cut';
  if (SEAM.some((r) => r.test(n))) return 'seam';
  return null;
}
