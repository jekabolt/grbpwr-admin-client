export { formatBytes } from 'utils/pattern';

/**
 * The extension, uppercased, for the plate a file shows when it has no preview.
 * Falls back to a dash rather than an empty plate: an empty tile reads as broken,
 * a dash reads as "nothing to show", which is the truth.
 */
export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0 || i === fileName.length - 1) return '—';
  const ext = fileName.slice(i + 1);
  return ext.length > 6 ? '—' : ext.toUpperCase();
}

/**
 * Trims the noise a browser or an export tool leaves in a filename, so the name the
 * person confirms at upload is already close to the one they would have typed.
 * The upload dialog is the only moment they still remember what the file is.
 */
export function tidyFileName(name: string): string {
  const i = name.lastIndexOf('.');
  const ext = i > 0 ? name.slice(i) : '';
  let stem = i > 0 ? name.slice(0, i) : name;
  stem = stem
    .replace(/\s*\(\d+\)\s*$/, '') // "grbpwr_graphic (1)" — the second download
    .replace(/[_-]+(final|copy|v\d+|\d+)$/i, '') // "_final", "-v2", "_3"
    .replace(/[_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return (stem || 'file') + ext;
}
