// QR ИЗНАНКИ ЭТИКЕТКИ A — матрица в примитивы листа (план §6.4, §7).
//
// `uqr` отдаёт саму матрицу (у `qrcode.react` её наружу не достать), и матрица становится
// `rect`-примитивами в мм — те же числа рисуют экран (SVG) и файл (PDF). Тёмные модули строки
// сливаются в один прямоугольник: у v3 это ~200 прямоугольников вместо ~450 модулей.
//
// Тихая зона (4 модуля) — НЕ здесь: это поле вокруг, его держит раскладка (QR стоит на 17,4 мм,
// припуск шва до 10). ECC — M, как у `PatternQR`.
//
// Шаблон ссылки: `{base_sku}` — в нижнем регистре. Витрина сравнивает хвост без регистра
// (`slug-tail.ts:23`), но middleware узнаёт `/p/` только строчной, и строчный URL остаётся в байтовом
// режиме QR без смешения — канонический вид один.
import { encode } from 'uqr';

import type { Prim } from '../assembly-print/paper';
import { hole, type Hole } from './holes';

export type QrRect = Extract<Prim, { k: 'rect' }>;

/** Сторона QR на ленте, мм (макет §4). */
export const QR_SIZE_MM = 13;
/** Ниже — предупреждение `qr-module-small`: термотрансфер 300 dpi ещё берёт, сканер — через раз. */
export const QR_MODULE_WARN_MM = 0.3;
/** Ниже — БЛОК `qr-module-tiny`. */
export const QR_MODULE_BLOCK_MM = 0.25;
/** Тихая зона по стандарту, модулей (держит раскладка). */
export const QR_QUIET_MODULES = 4;

/** Пресет по умолчанию: витрина сама редиректит `/p/<base_sku>` на язык сканирующего (§7). */
export const STOREFRONT_QR_TEMPLATE = 'https://grbpwr.com/p/{base_sku}';

export type QrMatrix = { version: number; size: number; data: boolean[][] };

export type QrResult = {
  prims: QrRect[];
  version: number;
  /** Модулей по стороне (без тихой зоны). */
  size: number;
  moduleMm: number;
  holes: Hole[];
};

export function qrMatrix(text: string): QrMatrix {
  const { version, size, data } = encode(text, { ecc: 'M', border: 0 });
  return { version, size, data };
}

/** Дыры ссылки: пусто — `qr-empty`, не `http(s)://хост` — `qr-not-http` (оба БЛОК, общие). */
export function qrUrlHoles(url: string): Hole[] {
  const v = url.trim();
  if (!v) return [hole('qr-empty', 'the QR link is empty — pick a preset or enter a template')];
  if (!/^https?:\/\/[^\s/]+/i.test(v) || /\s/.test(v)) {
    return [hole('qr-not-http', `the QR link must be an http(s):// address — got "${v}"`)];
  }
  return [];
}

/** Дыры размера модуля: < 0,25 мм — БЛОК, < 0,3 мм — предупреждение. */
export function qrModuleHoles(moduleMm: number): Hole[] {
  const mm = moduleMm.toFixed(3);
  if (moduleMm < QR_MODULE_BLOCK_MM) {
    return [
      hole(
        'qr-module-tiny',
        `QR module is ${mm} mm — below ${QR_MODULE_BLOCK_MM} mm it will not scan; shorten the link`,
      ),
    ];
  }
  if (moduleMm < QR_MODULE_WARN_MM) {
    return [
      hole(
        'qr-module-small',
        `QR module is ${mm} mm — below ${QR_MODULE_WARN_MM} mm scanning gets unreliable; a shorter link helps`,
      ),
    ];
  }
  return [];
}

/**
 * QR как примитивы листа: левый верхний угол матрицы в (x, y), сторона `sizeMm`. Пустой текст —
 * пустые примитивы и `qr-empty`.
 */
export function qrPrims(text: string, x: number, y: number, sizeMm = QR_SIZE_MM): QrResult {
  const urlHoles = qrUrlHoles(text);
  if (!text.trim()) return { prims: [], version: 0, size: 0, moduleMm: 0, holes: urlHoles };
  const { version, size, data } = qrMatrix(text);
  const moduleMm = sizeMm / size;
  const prims: QrRect[] = [];
  for (let r = 0; r < size; r += 1) {
    const row = data[r];
    for (let c = 0; c < size; ) {
      if (!row[c]) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < size && row[c]) c += 1;
      prims.push({
        k: 'rect',
        x: x + start * moduleMm,
        y: y + r * moduleMm,
        w: (c - start) * moduleMm,
        h: moduleMm,
        sw: 0,
        fill: true,
      });
    }
  }
  return { prims, version, size, moduleMm, holes: [...urlHoles, ...qrModuleHoles(moduleMm)] };
}

// ---------- шаблон ----------

export const QR_TEMPLATE_VARS = ['base_sku', 'sku', 'size', 'colorway_id', 'style'] as const;
export type QrTemplateVar = (typeof QR_TEMPLATE_VARS)[number];
export type QrTemplateVars = Partial<Record<QrTemplateVar, string | number>>;

/**
 * Подстановка `{base_sku} {sku} {size} {colorway_id} {style}`. `base_sku` — в нижнем регистре;
 * значения экранируются как компонент URL (`xs [44]` не ломает ссылку). Незнакомая `{…}` остаётся
 * как есть — её видно в живом примере под полем.
 */
export function renderTemplate(tpl: string, vars: QrTemplateVars): string {
  return tpl.replace(/\{(base_sku|sku|size|colorway_id|style)\}/g, (_, name: QrTemplateVar) => {
    const raw = vars[name];
    if (raw === undefined || raw === null) return '';
    const v = String(raw).trim();
    return encodeURIComponent(name === 'base_sku' ? v.toLowerCase() : v);
  });
}
