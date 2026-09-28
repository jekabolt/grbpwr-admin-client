// manifest.csv АРХИВА (план §9.6): одна строка на СТОРОНУ файла — сверка оператора «что где лежит».
// duplex: файл несёт лицо и изнанку → две строки с одним файлом; simplex: `-face`/`-back` — по одной.
import type { PlannedFile, PrintSet } from './pages';

export const MANIFEST_HEADER = [
  'colorway_sku',
  'colour',
  'size',
  'label',
  'side',
  'copies',
  'file',
];

export type ManifestColorway = { baseSku: string; colour: string };

/** Путь PDF файла плана внутри архива. */
export const filePath = (f: PlannedFile) => `${f.folder}/${f.stem}.pdf`;

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function manifestRows(
  set: PrintSet,
  colorways: ReadonlyMap<number, ManifestColorway>,
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const f of set.files) {
    const cw = colorways.get(f.colorwayId);
    const sides = f.side === 'both' ? (['face', 'back'] as const) : [f.side];
    for (const side of sides) {
      rows.push([
        cw?.baseSku ?? '',
        cw?.colour ?? '',
        f.size ?? '',
        f.label,
        side,
        f.copies,
        filePath(f),
      ]);
    }
  }
  return rows;
}

export function manifestCsv(
  set: PrintSet,
  colorways: ReadonlyMap<number, ManifestColorway>,
): string {
  return (
    [MANIFEST_HEADER, ...manifestRows(set, colorways)]
      .map((r) => r.map(cell).join(','))
      .join('\r\n') + '\r\n'
  );
}
