/** Hand bytes (or text) to the browser as a downloaded file. */
export function downloadFile(
  data: Uint8Array | string | Blob,
  name: string,
  type = 'application/octet-stream',
): void {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Deferred: Safari/Firefox may not have started the download when click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
