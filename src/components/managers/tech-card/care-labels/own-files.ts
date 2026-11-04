// OWN FILES IN THE PRINT ZIP. A file a person chose stands for the whole label of its cell: it goes
// into the archive byte for byte, with nothing printed over it, nothing scaled, and the generated
// label of that cell is not made at all. A file that is not 100 × 30 mm is said in the README, never
// refused: the person chose it, and only the printer can judge it.
import { filesService } from 'components/managers/files/api/filesService';
import { loadPdfjs } from 'components/managers/files/hooks/usePdfDocument';
import { oneFileOf, ownCellOf } from '../components/composition-label/composition-artwork-model';
import type { ArtworkFile } from '../components/sewn-label-model';
import { wireInt } from '../components/wire-int';
import { variantSku, type CareLabelData } from './adapter';
import { L } from './layout';
import { sizeStem } from './pages';
import { colorwayFolder } from './print-job';
import type { QtyGrid } from './quantities';

export type OwnManifestRow = {
  colorwaySku: string;
  variantSku: string;
  colour: string;
  size: string;
  copies: number;
};

/** One file of the archive before its bytes arrive. `stem` has no extension: the file decides it. */
export type OwnPlanned = {
  libraryFileId: number;
  stem: string;
  copies: number;
  rows: OwnManifestRow[];
};

export type OwnZipFile = {
  path: string;
  bytes: Uint8Array;
  copies: number;
  rows: OwnManifestRow[];
  /** `100 x 30 mm`, or `image` when the file has no size of its own. */
  size: string;
  /** Set when the file is not the size of the label. */
  warning?: string;
};

/**
 * What goes in. The file for everything lies once at the root with the sum of every cell; a cell's
 * file lies in its colour's folder. A cell with 0 copies gives no file.
 */
export function planOwnFiles(input: {
  files: readonly ArtworkFile[];
  data: Pick<CareLabelData, 'colorways' | 'sizes'>;
  cells: QtyGrid;
}): OwnPlanned[] {
  const { files, data, cells } = input;
  const one = oneFileOf(files);
  const rowOf = (
    cw: CareLabelData['colorways'][number],
    size: CareLabelData['sizes'][number],
    copies: number,
  ): OwnManifestRow => ({
    colorwaySku: cw.baseSku,
    variantSku: cw.baseSku && size.skuOrd != null ? variantSku(cw.baseSku, size.skuOrd) : '',
    colour: cw.colourName,
    size: size.label,
    copies,
  });

  if (one) {
    const rows = data.colorways.flatMap((cw) =>
      data.sizes
        .map((size) => rowOf(cw, size, cells[cw.id]?.[size.id] ?? 0))
        .filter((r) => r.copies > 0),
    );
    if (!rows.length) return [];
    return [
      {
        libraryFileId: wireInt(one.libraryFileId),
        stem: 'own-all',
        copies: rows.reduce((sum, r) => sum + r.copies, 0),
        rows,
      },
    ];
  }

  const out: OwnPlanned[] = [];
  for (const cw of data.colorways) {
    for (const size of data.sizes) {
      const file = ownCellOf(files, cw.id, size.id);
      const copies = cells[cw.id]?.[size.id] ?? 0;
      if (!file || copies <= 0) continue;
      const stem = sizeStem({ sizeId: size.id, label: size.label, skuOrd: size.skuOrd });
      out.push({
        libraryFileId: wireInt(file.libraryFileId),
        stem: `${colorwayFolder(cw.baseSku, cw.colourName, cw.id)}/own-${stem}`,
        copies,
        rows: [rowOf(cw, size, copies)],
      });
    }
  }
  return out;
}

/** The extension from the name, else from the type. Only what is safe in a path. */
export function ownExtension(fileName: string, contentType: string): string {
  const dot = fileName.lastIndexOf('.');
  const fromName = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  if (/^[a-z0-9]{1,6}$/.test(fromName)) return fromName;
  const type = contentType.toLowerCase();
  if (type === 'application/pdf') return 'pdf';
  if (type === 'image/jpeg') return 'jpg';
  const fromType = type.startsWith('image/') ? type.slice('image/'.length) : '';
  return /^[a-z0-9]{1,6}$/.test(fromType) ? fromType : 'bin';
}

const MM_PER_PT = 25.4 / 72;
/** How far a page can be from the label and still be the label. */
const SIZE_SLACK_MM = 1;

/** `100 x 30 mm` for a page, and whether that is the label, either way round. */
export function describePageSize(widthMm: number, heightMm: number): { text: string; ok: boolean } {
  const w = Math.round(widthMm);
  const h = Math.round(heightMm);
  const near = (a: number, b: number) => Math.abs(a - b) <= SIZE_SLACK_MM;
  return {
    text: `${w} x ${h} mm`,
    ok: (near(widthMm, L.W) && near(heightMm, L.H)) || (near(widthMm, L.H) && near(heightMm, L.W)),
  };
}

async function pdfPageMm(bytes: Uint8Array): Promise<{ w: number; h: number } | null> {
  try {
    const pdfjs = await loadPdfjs();
    // pdf.js takes the buffer over to its worker, and the archive still needs these bytes.
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    try {
      const page = await doc.getPage(1);
      const [x0, y0, x1, y1] = page.view;
      return { w: (x1 - x0) * MM_PER_PT, h: (y1 - y0) * MM_PER_PT };
    } finally {
      await doc.destroy();
    }
  } catch {
    return null;
  }
}

/** Reads every planned file from the library. One that does not arrive fails the whole archive. */
export async function loadOwnFiles(planned: readonly OwnPlanned[]): Promise<OwnZipFile[]> {
  const ids = [...new Set(planned.map((p) => p.libraryFileId))];
  const loaded = new Map(
    await Promise.all(
      ids.map(async (id) => {
        const { file } = await filesService.getFile(id);
        const url = file?.downloadUrl;
        if (!url) throw new Error(`own file ${file?.fileName ?? id}: no download link`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`own file ${file?.fileName ?? id}: ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const contentType = file?.contentType ?? '';
        const extension = ownExtension(file?.fileName ?? '', contentType);
        const pdf = extension === 'pdf' || contentType.toLowerCase() === 'application/pdf';
        return [id, { bytes, extension, page: pdf ? await pdfPageMm(bytes) : null, pdf }] as const;
      }),
    ),
  );
  return planned.map((p) => {
    const { bytes, extension, page, pdf } = loaded.get(p.libraryFileId)!;
    const path = `${p.stem}.${extension}`;
    const size = page ? describePageSize(page.w, page.h) : null;
    return {
      path,
      bytes,
      copies: p.copies,
      rows: p.rows,
      size: size?.text ?? (pdf ? 'size unknown' : 'image'),
      warning: size && !size.ok ? `${path} is ${size.text}, not 100 x 30 mm` : undefined,
    };
  });
}
