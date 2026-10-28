import { useEffect, useMemo, useRef, useState } from 'react';

import type { PrintDep, PrintDepStatus } from 'components/managers/print/use-print-ready';

import type { PdfLang } from './langs';
import { onOwnSeen, setOwnState } from './own';

// Имя языка для модели. cn — упрощённый: фабрики, с которыми работаем, читают его.
const MODEL_LANG: Record<PdfLang, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  es: 'Spanish',
  pl: 'Polish',
  ru: 'Russian',
  cn: 'Simplified Chinese',
  ja: 'Japanese',
  kr: 'Korean',
};

// Ответ модели ограничен по длине — карточку шлём кусками, а не одним запросом на 300 строк.
const BATCH = 40;
const CACHE_KEY = (lang: string) => `techpack-own:v1:${lang}`;
const CACHE_LIMIT = 3000;

const tables = new Map<string, Map<string, string>>();

function tableFor(lang: string): Map<string, string> {
  let t = tables.get(lang);
  if (t) return t;
  t = new Map();
  try {
    const raw = localStorage.getItem(CACHE_KEY(lang));
    if (raw)
      for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) t.set(k, v);
  } catch {
    /* кэш — удобство: без него просто переводим заново */
  }
  tables.set(lang, t);
  return t;
}

function persist(lang: string, t: Map<string, string>) {
  try {
    const entries = [...t.entries()].slice(-CACHE_LIMIT);
    localStorage.setItem(CACHE_KEY(lang), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* переполнен или запрещён — переживём */
  }
}

async function translateBatch(lang: PdfLang, texts: string[]): Promise<Map<string, string>> {
  const fields = Object.fromEntries(texts.map((s, i) => [`f${i}`, s]));
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: { langName: 'English', fields },
      targets: [{ code: lang, langName: MODEL_LANG[lang] }],
      constraints: {},
      context: 'techpack',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    translations?: Record<string, Record<string, string>>;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `translate ${res.status}`);
  const got = data.translations?.[lang] ?? {};
  const out = new Map<string, string>();
  texts.forEach((s, i) => {
    const v = got[`f${i}`];
    if (typeof v === 'string' && v.trim()) out.set(s, v);
  });
  return out;
}

/**
 * Translates the card's own text on the sheet into the PDF language. Returns a print dependency
 * (the «save as pdf» gate waits for it; a failure prints the originals and is named on paper) and a
 * key to remount the document with, so its memoised derivations pick the translations up.
 */
export function useOwnTranslation(lang: PdfLang): { dep: PrintDep; docKey: string } {
  const state = useMemo(
    () => ({
      lang,
      table: lang === 'en' ? new Map<string, string>() : tableFor(lang),
      seen: new Set<string>(),
    }),
    [lang],
  );
  // Язык выставляется до отрисовки документа: own() в этой же отрисовке уже смотрит в его таблицу.
  setOwnState(state);

  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<PrintDepStatus>('ok');
  const inflight = useRef(new Set<string>());
  const failed = useRef(new Set<string>());

  useEffect(() => {
    inflight.current = new Set();
    failed.current = new Set();
    if (lang === 'en') {
      setStatus('ok');
      onOwnSeen(null);
      return;
    }
    let alive = true;
    // Пока документ не отрисовал свой текст, гейт не должен счесть перевод готовым.
    setStatus('pending');

    const pump = () => {
      if (!alive) return;
      const todo = [...state.seen].filter(
        (s) => !state.table.has(s) && !inflight.current.has(s) && !failed.current.has(s),
      );
      if (todo.length === 0) {
        if (inflight.current.size === 0) setStatus(failed.current.size > 0 ? 'error' : 'ok');
        return;
      }
      setStatus('pending');
      todo.forEach((s) => inflight.current.add(s));
      const batches: string[][] = [];
      for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
      Promise.allSettled(batches.map((b) => translateBatch(lang, b))).then((results) => {
        if (!alive) return;
        results.forEach((r, i) => {
          const batch = batches[i];
          batch.forEach((s) => inflight.current.delete(s));
          if (r.status === 'fulfilled') {
            r.value.forEach((v, k) => state.table.set(k, v));
            batch.filter((s) => !r.value.has(s)).forEach((s) => failed.current.add(s));
          } else {
            batch.forEach((s) => failed.current.add(s));
          }
        });
        persist(lang, state.table);
        setVersion((v) => v + 1);
        pump();
      });
    };

    onOwnSeen(pump);
    // Текст, который уже прошёл через own() в первой отрисовке, ждёт этого прохода.
    const first = setTimeout(pump, 0);
    return () => {
      alive = false;
      clearTimeout(first);
      onOwnSeen(null);
    };
  }, [lang, state]);

  return { dep: { label: 'translation', status }, docKey: `${lang}:${version}` };
}
