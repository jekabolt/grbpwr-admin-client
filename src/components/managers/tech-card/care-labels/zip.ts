// ZIP ДЛЯ ПЕЧАТИ (план §9.6): README.txt, 00-alignment-test.pdf (duplex), manifest.csv, папка на
// колорвей с PDF по размеру, svg/ по файлу на уникальную сторону. fflate — лениво (экран без
// кнопки его не тянет); PDF внутри уже сжаты FlateDecode — кладутся `level 0`, текст — `level 6`.
import type { Hole } from './holes';
import { manifestCsv, filePath, type ManifestColorway } from './manifest';
import { alignmentTestPdf, filePdf, sideSvg, type PrintSet } from './pages';
import { archiveCounts, readmeText, type ArchiveCounts } from './readme';
import type { Shaper } from './text-outline';

/** `<STYLE>-care-labels-<YYYYMMDD>.zip` — дата локальная (день, когда оператор скачал). */
export function zipName(style: string, at: Date): string {
  const s =
    style
      .trim()
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'style';
  const ymd = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}`;
  return `${s}-care-labels-${ymd}.zip`;
}

export type CareLabelZipInput = {
  shaper: Shaper;
  /** Архивный план: только колорвеи в ZIP, настоящие копии. */
  set: PrintSet;
  style: string;
  styleName: string;
  colorways: ReadonlyMap<number, ManifestColorway>;
  qrTemplate: string;
  adminUrl: string;
  warnings: readonly Hole[];
  at?: Date;
};

export type CareLabelZip = {
  name: string;
  bytes: Uint8Array;
  /** Пути внутри архива в порядке записи. */
  paths: string[];
  counts: ArchiveCounts;
  readme: string;
};

export async function buildCareLabelZip(input: CareLabelZipInput): Promise<CareLabelZip> {
  const { zipSync, strToU8 } = await import('fflate');
  const at = input.at ?? new Date();
  const { set } = input;
  const counts = archiveCounts(set);
  const readme = readmeText({
    style: input.style,
    styleName: input.styleName,
    mode: set.mode,
    counts,
    qrTemplate: input.qrTemplate,
    generatedAt: at,
    adminUrl: input.adminUrl,
    warnings: input.warnings,
  });

  type Entry = [Uint8Array, { level: 0 | 6 }];
  const text = (s: string): Entry => [strToU8(s), { level: 6 }];
  const pdf = (b: Uint8Array): Entry => [b, { level: 0 }];
  const files: Record<string, Entry> = {};
  files['README.txt'] = text(readme);
  if (set.mode === 'duplex') files['00-alignment-test.pdf'] = pdf(alignmentTestPdf(input.shaper));
  files['manifest.csv'] = text(manifestCsv(set, input.colorways));
  for (const f of set.files) {
    const path = filePath(f);
    if (files[path]) throw new Error(`care-labels zip: duplicate path ${path}`);
    files[path] = pdf(filePdf(set, f));
  }
  for (const [key, s] of set.sides) {
    const path = `svg/${s.svgStem}.svg`;
    if (files[path]) throw new Error(`care-labels zip: duplicate path ${path}`);
    files[path] = text(sideSvg(set, key));
  }

  const bytes = zipSync(files, { mtime: at });
  return { name: zipName(input.style, at), bytes, paths: Object.keys(files), counts, readme };
}

/** Отдать архив браузеру файлом. */
export function saveBlob(bytes: Uint8Array, name: string, type = 'application/zip') {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
