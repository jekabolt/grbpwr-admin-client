/**
 * Lowercase hex SHA-256 of the bytes (WebCrypto). '' when the digest cannot be computed — no
 * `crypto.subtle` outside a secure context — so a caller treats it as «unknown», never as a match.
 */
export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return '';
    const buf: ArrayBuffer =
      data instanceof ArrayBuffer
        ? data
        : data instanceof Uint8Array
          ? (data.slice().buffer as ArrayBuffer)
          : await data.arrayBuffer();
    const digest = await subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}
