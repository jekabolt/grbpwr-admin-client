const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const CODE_TOKEN = /^[A-Z0-9][A-Z0-9._/-]*$/i;

/** Piece codes printed in assembly diagrams/text. Stable storage keys are deliberately rejected. */
export function assemblyPieceCode(pieceName?: string, dxfAlias?: string): string {
  const code = (value: string | undefined, requireCodeShape: boolean) => {
    const candidate = (value ?? '').trim();
    const codeShaped = candidate === candidate.toUpperCase() || /[0-9_./-]/.test(candidate);
    return candidate.length <= 24 &&
      CODE_TOKEN.test(candidate) &&
      !ULID.test(candidate) &&
      (!requireCodeShape || codeShaped)
      ? candidate
      : '';
  };
  return code(pieceName, true) || code(dxfAlias, false);
}
