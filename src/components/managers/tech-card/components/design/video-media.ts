/**
 * ═══ THE ADDRESS POINTS AT A CLIP (B-32) ═════════════════════════════════════════════════════════
 *
 * A video run's output is an .mp4 in every slot of its media row (`UploadContentVideo`: full,
 * compressed and thumbnail are one object, no still — the bucket makes no thumbnail of a clip), and
 * the wire carries no content type (`common.MediaInfo` = url, width, height; see `threed/media.ts`
 * for the same fact about models). The extension IS the declared type, as it is for `.glb`.
 *
 * Decided on the PATH, not the whole string, like `isModelUrl`: a signed query (`?X-Amz-…`) or an
 * anchor must neither switch the sign on nor off. (`lib/features/filterContentType.isVideo` splits
 * the whole url on `.` and reads the last piece, so a query with a dot would lie to it.)
 */
export function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  const ext = (path: string) => {
    const p = path.toLowerCase();
    return p.endsWith('.mp4') || p.endsWith('.webm');
  };
  try {
    return ext(new URL(url).pathname);
  } catch {
    // A relative address (a stand, a blob stub) — `new URL` without a base throws on it.
    return ext(url.split('?')[0].split('#')[0]);
  }
}
