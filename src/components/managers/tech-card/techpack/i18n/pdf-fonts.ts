import { useEffect, useState } from 'react';

import type { PrintDep, PrintDepStatus } from 'components/managers/print/use-print-ready';

// FeatureMono несёт латиницу, кириллицу и польские знаки, но ни одного иероглифа: лист на cn/ja/kr
// без своего шрифта печатался бы тем, что найдёт ОС, а на машине без CJK-шрифтов — квадратиками.
// Noto берём с Google Fonts: он режет шрифт по unicode-range, и браузер тянет только куски с
// иероглифами, которые реально стоят на листе, а не 10 МБ целиком. FeatureMono остаётся первым —
// коды, цифры и латиница печатаются тем же моноширинным, что и в английском листе.
// Семейство своё для каждого языка, а не одно на всех: один и тот же код Unicode в китайском и
// японском рисуется разными глифами, и японский лист китайским начертанием читается как чужой.
const CJK: Record<string, { family: string; fallback: string; sample: string }> = {
  cn: {
    family: 'Noto Sans SC',
    fallback: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei'",
    sample: '技术包工序',
  },
  ja: {
    family: 'Noto Sans JP',
    fallback: "'Hiragino Sans', 'Yu Gothic', Meiryo",
    sample: '仕様書工程',
  },
  kr: {
    family: 'Noto Sans KR',
    fallback: "'Apple SD Gothic Neo', 'Malgun Gothic'",
    sample: '작업지시서',
  },
};

const stack = (lang: string) => {
  const cjk = CJK[lang];
  return cjk
    ? `'FeatureMono', '${cjk.family}', ${cjk.fallback}, sans-serif`
    : `'FeatureMono', 'Inter', 'Helvetica Neue', Arial, sans-serif`;
};

/**
 * CSS for the v6 sheet, keyed on the `data-pdf-lang` attribute of its root. Body sets its font
 * once, and children inherit the computed value — so the stack is set on the root itself and on the
 * tokens, for any child that asks for `font-sans`/`font-mono` by class.
 */
export const PDF_FONTS_CSS = Object.keys(CJK)
  .map(
    (lang) => `
[data-pdf-lang="${lang}"] {
  font-family: ${stack(lang)};
  --font-family-sans: ${stack(lang)};
  --font-family-mono: ${stack(lang)};
  --font-sans: ${stack(lang)};
  --font-mono: ${stack(lang)};
}
[data-pdf-lang="${lang}"] * { letter-spacing: 0 !important; }`,
  )
  .join('\n');

const LINK_ID = (lang: string) => `pdf-font-${lang}`;

const href = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;700&display=block`;

/**
 * A print dependency: the CJK face of the chosen language is loaded before «save as pdf» unlocks.
 * Non-CJK languages need nothing and report ok at once. A failed load is not fatal — the sheet falls
 * back to the OS fonts in the stack — but the degraded notice names it, because a machine without
 * them prints squares.
 */
export function usePdfFonts(lang: string): PrintDep {
  const cjk = CJK[lang];
  const [status, setStatus] = useState<PrintDepStatus>(cjk ? 'pending' : 'ok');

  useEffect(() => {
    if (!cjk) {
      setStatus('ok');
      return;
    }
    setStatus('pending');
    let alive = true;
    if (!document.getElementById(LINK_ID(lang))) {
      const link = document.createElement('link');
      link.id = LINK_ID(lang);
      link.rel = 'stylesheet';
      link.href = href(cjk.family);
      document.head.appendChild(link);
    }
    const link = document.getElementById(LINK_ID(lang)) as HTMLLinkElement;
    // Стиль ещё не пришёл — FontFaceSet не знает семейства и load() вернул бы пустой список «успешно».
    const sheetReady =
      link.sheet != null
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
            link.addEventListener('load', () => resolve(), { once: true });
            link.addEventListener('error', () => reject(new Error('font css')), { once: true });
          });
    sheetReady
      .then(() =>
        Promise.all(
          ['400', '700'].map((w) => document.fonts.load(`${w} 12px '${cjk.family}'`, cjk.sample)),
        ),
      )
      .then((faces) => {
        if (alive) setStatus(faces.every((f) => f.length > 0) ? 'ok' : 'error');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [lang, cjk]);

  return { label: 'cjk font', status };
}
