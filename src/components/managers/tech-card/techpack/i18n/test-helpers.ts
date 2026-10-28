const OWN_TEXT = [
  // Product, collection and brand names stay verbatim by owner decision.
  'Workshop jacket',
  'Core',
  'GRBPWR',
] as const;

export function visibleText(markup: string): string {
  return (
    markup
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ' ')
      // The label tape prints as sewn on the garment, in any sheet language (owner 28.10).
      .replace(/<(\w+)\b[^>]*\btranslate="no"[^>]*>[^<]*<\/\1>/g, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
  );
}

function withoutFixtureText(node: string): string {
  let text = node;
  for (const allowed of [...OWN_TEXT].sort((a, b) => b.length - a.length)) {
    const escaped = allowed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(^| · )${escaped}(?=$| · )`, 'g'), '$1');
  }
  return text;
}

export function outsideTranslations(markup: string): string {
  return visibleText(markup)
    .split('\n')
    .map((node) => {
      const source = node.trim();
      let text = withoutFixtureText(node)
        .replace(/⟦[^⟧]*⟧/g, ' ')
        .replace(/⟪[^⟫]*⟫/g, ' ');
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
        .replace(/⟪[^⟫]*⟫/g, ' ')
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
