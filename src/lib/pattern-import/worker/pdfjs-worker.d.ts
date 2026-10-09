// pdf.js ships its worker module without types; the import worker only needs the handler.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  export const WorkerMessageHandler: unknown;
}
