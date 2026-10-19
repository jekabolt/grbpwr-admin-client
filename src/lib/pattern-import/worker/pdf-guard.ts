// pdf.js behind the import's input guards (M6). Wraps the module both PDF loaders get (vector
// adapter and raster adapter) so EVERY `getDocument` of the import:
//   • refuses a document with more than `maxPages` pages as soon as its catalog is read — before
//     any page is parsed (typed `too-large`, the session adds the file name);
//   • never evaluates code: `isEvalSupported: false` (pdf.js then interprets PostScript functions
//     instead of compiling them with `new Function`), `enableXfa: false`; pdf.js core never runs a
//     document's JavaScript at all — that needs the viewer's scripting sandbox, which this worker
//     does not load. Embedded files and JS actions are data pdf.js does not act on here.
//   • drops an embedded image larger than `maxImagePixels` instead of decoding it (`maxImageSize`),
//     so one oversized scan cannot take the worker's memory.
import type { PdfjsModule } from '../adapters/pdf';
import { PATIMPORT } from '../types';
import { ImportError } from './errors';
import { pdfPagesRefusal } from './limits';

export type PdfGuardOpts = { maxPages?: number; maxImagePixels?: number };

export function guardPdfjs(mod: PdfjsModule, opts: PdfGuardOpts = {}): PdfjsModule {
  const maxPages = opts.maxPages ?? PATIMPORT.maxPdfPages;
  const maxImagePixels = opts.maxImagePixels ?? PATIMPORT.maxRasterPixels;
  const getDocument = ((src: Parameters<PdfjsModule['getDocument']>[0]) => {
    const params =
      src && typeof src === 'object' && !(src instanceof Uint8Array) && !(src instanceof URL)
        ? src
        : { data: src };
    const task = mod.getDocument({
      ...(params as object),
      isEvalSupported: false,
      enableXfa: false,
      maxImageSize: maxImagePixels,
    } as Parameters<PdfjsModule['getDocument']>[0]);
    const checked = task.promise.then((doc) => {
      const refusal = pdfPagesRefusal(doc.numPages, 'the PDF', maxPages);
      if (refusal) {
        void task.destroy();
        throw new ImportError(refusal.code, refusal.message);
      }
      return doc;
    });
    // The loading task keeps its methods (destroy, onProgress …); only `promise` is checked.
    return new Proxy(task, {
      get(t, k) {
        if (k === 'promise') return checked;
        const v = Reflect.get(t, k, t);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  }) as PdfjsModule['getDocument'];
  // A module namespace is frozen: hand out a plain object with the same members.
  return { ...mod, getDocument } as PdfjsModule;
}
