// Screen original PDFs for the page-level input required by printed-cut-ranges.mjs.
// node scripts/pattern-import/printed-cut-scan.mjs <pdf> [more PDFs...] > pages.jsonl
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { isPrintedCutPage } from './printed-cut-ranges.mjs';

const files = process.argv.slice(2);
if (!files.length) throw Error('Supply at least one PDF');
for (const file of files) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
  const pages = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      if (isPrintedCutPage(items.map((t) => t.str ?? ''))) pages.push(n);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  console.log(JSON.stringify({ file, pages }));
}
