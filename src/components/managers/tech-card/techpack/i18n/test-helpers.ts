const OWN_TEXT = [
  // Product and brand names stay verbatim by owner decision.
  'Workshop jacket',
  'GRBPWR',
  // Other card-authored fields pass through own(); a separate lane translates this seam.
  'Core',
  'Left front',
  'Right front',
  'front',
  'Back panel',
  'Cotton twill',
  'Black',
  'cotton',
  'Core thread',
  'polyester',
  'Thread House',
  'Button',
  'horn',
  'Match notches',
  'Front unit',
  'Front placket',
  'CB neck',
  'edge stitch',
  'end fold',
  'Confirm pocket depth',
  'A. Maker',
  'Sample approved',
  'Night',
  'Main marker',
  'T. Owner',
  'Button placement',
  'Chest width',
  'Body length',
  'Join lockstitch',
  'Join / seam',
  'Fuse',
  'Button attach',
  // Raw fixture state and enum labels pass through the placeholder-only common.generated key.
  'released',
  'tech card target gender unisex',
  'main material',
  'button',
  'SHELL',
  'updated',
  'construction',
] as const;

export function visibleText(markup: string): string {
  return markup
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function withoutFixtureText(node: string): string {
  let text = node;
  for (const allowed of [...OWN_TEXT].sort((a, b) => b.length - a.length)) {
    text = text.replaceAll(allowed, ' ');
  }
  return text;
}

export function outsideTranslations(markup: string): string {
  return visibleText(markup)
    .split('\n')
    .map((node) => {
      const source = node.trim();
      let text = withoutFixtureText(node).replace(/⟦[^⟧]*⟧/g, ' ');
      // Paper codes, the fixed abbreviations, fixture sizes, and measurement units stay verbatim.
      text = text.replaceAll('m/c', ' ');
      text = text.replaceAll('L+R', ' ');
      text = text
        .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, ' ')
        .replace(/\b[A-Z]{1,4}(?:-[A-Z0-9]+)+\b/g, ' ')
        .replace(/\b(?:SA|CB|CF|TS|GSM|PAIR|RS|WS|DXF|P|A|B|M|L|EUR|C)\b/g, ' ')
        .replace(/\b(?:mm|cm|m|m²|s|pc|pcs|rev|v|op|bom|qr|gsm)\b/gi, ' ')
        .replace(/\bN\/cm²\b/g, ' ')
        .replace(/\bv(?=\d)/gi, ' ')
        .replace(/[\d\s\p{P}\p{S}]+/gu, ' ')
        .trim();
      return /[A-Za-z]/.test(text) ? `${text} ← ${source}` : '';
    })
    .filter(Boolean)
    .join(' | ');
}

export function englishWordLeaks(
  markup: string,
  englishWords: ReadonlySet<string>,
  allowedWords: ReadonlySet<string>,
): string {
  return visibleText(markup)
    .split('\n')
    .map((node) => {
      const source = node.trim();
      const text = withoutFixtureText(node)
        .replaceAll('m/c', ' ')
        .replaceAll('L+R', ' ')
        .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, ' ')
        .replace(/\b(?:SA|CB|CF|TS|GSM|PAIR|RS|WS|DXF|PDF|BOM)\b/g, ' ')
        .replace(/\b(?:mm|cm|m|m²|g|s)\b/gi, ' ');
      const leaks = (text.match(/[A-Za-z]+/g) ?? [])
        .map((word) => word.toLowerCase())
        .filter((word) => word.length > 1)
        .filter((word) => englishWords.has(word) && !allowedWords.has(word));
      return leaks.length ? `${[...new Set(leaks)].join(', ')} ← ${source}` : '';
    })
    .filter(Boolean)
    .join(' | ');
}
