// «КАК ШЬЮТ» — полоса шага в порядке швеи: разрез шва → стежок (ISO 4915) → обработка припусков →
// ВТО → отстрочка → лапка. Решение владельца 10.10 (дизайн координатора):
//
//   • ЗНАЧЕНИЕ = поле шага, иначе стандарт карточки (метка «std»), иначе ПУСТОЙ слот «not set»,
//     который дверь к полю шага. Догадки каркаса глифом не становятся никогда: черновик каркаса
//     оставляет эти поля пустыми, и полоса это честно показывает.
//   • ТОНКИЙ вид шва (SeamKind) — только из класса шага + номера стежка, детерминированной таблицей
//     ниже. Класс даёт несколько видов, а стежок не различает — рисуется глиф класса и слово класса,
//     тоньше не угадываем.
//   • Глиф стежка — только когда машинка даёт ОДИН номер ISO; семейство («504 / 514 / 516») —
//     словами, без глифа.
//   • ВТО — из следующего шага PRESS / PRESS_OPEN над тем же узлом (наездник шага), если он есть.
//
// Чистая функция над строкой формы и стандартами карточки: экран и печать зовут её одну.
import type { common_TechCardSeamClass } from 'api/proto-http/admin';
import type { SeamKind } from '../design/seam-icons';
import { machineTypeLabel, stitchTypeNumber } from '../equipment-options';
import {
  attachmentKindLabel,
  pressActionLabel,
  pressTowardLabel,
  seamClassLabel,
  topstitchLine,
} from '../operation-options';

/** Поле шага, к которому ведёт пустой слот. */
export type SewnField = 'seamClass' | 'machineType';

export type SewnTile =
  | {
      kind: 'section' | 'stitch' | 'finish' | 'press' | 'topstitch' | 'foot';
      /** Глиф: вид шва (SeamIcon) или номер ISO с кистью (StitchPictogram); нет — только слово. */
      seam?: SeamKind;
      iso?: string;
      /** Одно слово / число под глифом. */
      word: string;
      /** Полная фраза для подсказки и печати. */
      title: string;
      /** Значение пришло со стандарта карточки, а не с шага. */
      std?: boolean;
    }
  | { kind: 'empty'; field: SewnField; word: string; title: string };

export type SewnOp = {
  operationType?: string;
  seamClass?: string;
  machineType?: string;
  machineProfileKey?: string;
  threadCount?: number;
  topstitchMode?: string;
  topstitchWidthMm?: string;
  topstitchRows?: number;
  attachmentKind?: string;
  pressAction?: string;
  pressToward?: string;
  inputKeys?: string[];
  outputUnitKey?: string;
};

export type SewnCard = {
  defaultSeamClass?: string;
  machines: ReadonlyArray<{
    profileKey?: string;
    machineType?: string;
    threadCount?: number;
    attachmentKind?: string;
  }>;
};

const MACHINE = 'TECH_CARD_OPERATION_TYPE_MACHINE';
const set = (v?: string) => !!v && !v.endsWith('_UNKNOWN');

/** Класс → глиф класса (рисунок, который класс показывает без уточнения). OS / OTHER — словами. */
const CLASS_GLYPH: Partial<Record<common_TechCardSeamClass, SeamKind>> = {
  TECH_CARD_SEAM_CLASS_SS_PLAIN: 'sm_plain_overlock',
  TECH_CARD_SEAM_CLASS_SS_FRENCH: 'sm_french',
  TECH_CARD_SEAM_CLASS_LS_LAPPED: 'sm_lapped',
  TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED: 'sm_flat_felled',
  TECH_CARD_SEAM_CLASS_EF_HEM_RAW: 'sm_hem_raw',
  TECH_CARD_SEAM_CLASS_EF_HEM_TURNED: 'sm_hem_turned',
  TECH_CARD_SEAM_CLASS_EF_FACED: 'sm_hem_faced',
  TECH_CARD_SEAM_CLASS_BS_BOUND: 'sm_bound',
  TECH_CARD_SEAM_CLASS_FS_FLAT: 'sm_flatlock',
};

/**
 * Тонкий вид, который класс + номер стежка называют ОДНОЗНАЧНО (SEAM_LABEL дизайна несёт номер
 * прямо в подписи: «safety stitch 516», «blind hem 103», «coverstitch hem 406/602», «flatlock 607»).
 */
const FINE: Array<{ cls: common_TechCardSeamClass; iso: string[]; kind: SeamKind }> = [
  { cls: 'TECH_CARD_SEAM_CLASS_SS_PLAIN', iso: ['504', '514'], kind: 'sm_plain_overlock' },
  { cls: 'TECH_CARD_SEAM_CLASS_SS_PLAIN', iso: ['516'], kind: 'sm_safety' },
  { cls: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED', iso: ['103'], kind: 'sm_hem_blind' },
  {
    cls: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW',
    iso: ['406', '407', '602', '605'],
    kind: 'sm_hem_cover',
  },
  { cls: 'TECH_CARD_SEAM_CLASS_FS_FLAT', iso: ['607'], kind: 'sm_flatlock' },
];

/** «SS — plain seam» → «plain · SS»: слово под глифом, класс ISO 4916 буквами. */
export function classWord(cls: string): string {
  const label = seamClassLabel(cls);
  const m = label.match(/^([A-Z]{2})\s+—\s+(.+)$/);
  if (!m) return label;
  const word = m[2].replace(/\s*\/.*$/, '').replace(/ seam$/, '');
  return `${word} · ${m[1]}`;
}

/** Профиль машинки шага: по ключу, иначе единственный профиль этого типа на карточке. */
function profileOf(op: SewnOp, card: SewnCard) {
  const key = (op.machineProfileKey ?? '').trim();
  if (key) return card.machines.find((m) => m.profileKey === key);
  const same = card.machines.filter((m) => m.machineType === op.machineType);
  return same.length === 1 ? same[0] : undefined;
}

/**
 * Полоса шага `i`. `ops` — весь порядок (ВТО ищется в шаге-наезднике), `card` — стандарты карточки.
 * Пусто — шаг ничего не шьёт (обработка ВТО, фурнитура …).
 */
export function sewnStrip(ops: readonly SewnOp[], i: number, card: SewnCard): SewnTile[] {
  const op = ops[i];
  if (!op || op.operationType !== MACHINE) return [];
  const tiles: SewnTile[] = [];

  // 1. Разрез шва.
  const ownCls = set(op.seamClass) ? op.seamClass! : '';
  const stdCls = !ownCls && set(card.defaultSeamClass) ? card.defaultSeamClass! : '';
  const cls = ownCls || stdCls;

  // 2. Стежок: номер — только однозначный.
  const machine = set(op.machineType) ? op.machineType! : '';
  const profile = machine ? profileOf(op, card) : undefined;
  const ownThreads = (op.threadCount ?? 0) > 0;
  const threads = ownThreads ? op.threadCount : profile?.threadCount;
  const iso = machine ? stitchTypeNumber(machine, threads) : '';

  if (cls) {
    const fine = FINE.find((f) => f.cls === cls && f.iso.includes(iso))?.kind;
    const glyph = fine ?? CLASS_GLYPH[cls as common_TechCardSeamClass];
    tiles.push({
      kind: 'section',
      seam: glyph,
      word: classWord(cls),
      title: `seam ${seamClassLabel(cls)}${stdCls ? ' — the card’s standard' : ''}`,
      std: !!stdCls,
    });
  } else
    tiles.push({
      kind: 'empty',
      field: 'seamClass',
      word: 'seam type',
      title: 'seam type — not set on the step or the card: open the step to set it',
    });

  if (!machine)
    tiles.push({
      kind: 'empty',
      field: 'machineType',
      word: 'machine',
      title: 'machine — not set: open the step to set it',
    });
  else if (iso)
    tiles.push({
      kind: 'stitch',
      iso,
      word: iso,
      title: `${machineTypeLabel(machine).replace(/\s+\d[\d\s/]*$/, '')} · ISO 4915 stitch ${iso}${
        !ownThreads && threads ? ' (threads from the card’s machine profile)' : ''
      }`,
      std: !ownThreads && !!threads && !/^(301|401|103|304)$/.test(iso),
    });
  else
    tiles.push({
      kind: 'stitch',
      word: machineTypeLabel(machine) || 'machine',
      title: `${machineTypeLabel(machine)} — the stitch number depends on the thread count, not stated`,
    });

  // 3. Обработка припусков — только когда её называет СТЕЖОК: оверлок обмётывает срез сам.
  if (/^(504|514|516)$/.test(iso))
    tiles.push({
      kind: 'finish',
      word: 'overlocked',
      title: `allowances overlocked together by the ${iso} stitch`,
    });

  // 4. ВТО — шаг-наездник: следующий PRESS / PRESS_OPEN над результатом этого шага.
  const out = (op.outputUnitKey ?? '').trim();
  const next = ops[i + 1];
  if (
    next &&
    (next.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN' ||
      next.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS') &&
    out &&
    (next.inputKeys ?? []).includes(out)
  ) {
    const open = next.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN';
    const action = pressActionLabel(next.pressAction);
    const toward = pressTowardLabel(next.pressToward);
    const word = open ? 'press open' : action || 'press';
    tiles.push({
      kind: 'press',
      word,
      title: [word, toward].filter(Boolean).join(' '),
    });
  }

  // 5. Отстрочка: «6 mm ×2». Нет режима — отстрочки нет (это ответ, а не пропуск).
  const line = topstitchLine(op.topstitchMode, op.topstitchWidthMm, op.topstitchRows);
  if (line) {
    const mm = (op.topstitchWidthMm ?? '').trim();
    const rows = op.topstitchRows ?? 0;
    tiles.push({
      kind: 'topstitch',
      iso: iso === '301' ? (rows === 2 ? '301 ×2' : '301') : undefined,
      word: `${mm ? `${mm} mm` : 'edge'}${rows > 1 ? ` ×${rows}` : ''}`,
      title: line,
    });
  }

  // 6. Лапка / приспособление.
  const foot = set(op.attachmentKind) ? op.attachmentKind! : '';
  const stdFoot = !foot && set(profile?.attachmentKind) ? profile!.attachmentKind! : '';
  if (foot || stdFoot)
    tiles.push({
      kind: 'foot',
      word: attachmentKindLabel(foot || stdFoot),
      title: `attachment: ${attachmentKindLabel(foot || stdFoot)}${stdFoot ? ' (machine profile)' : ''}`,
      std: !!stdFoot,
    });
  return tiles;
}

/** Ключ отличия шва для легенды PIECES: разрез + номер. Пустые слоты швом не считаются. */
export function seamSignature(tiles: readonly SewnTile[]): string | null {
  const sec = tiles.find((t) => t.kind === 'section');
  const st = tiles.find((t) => t.kind === 'stitch');
  if (!sec || sec.kind === 'empty') return null;
  return `${sec.word}|${st && st.kind !== 'empty' ? st.word : ''}`;
}

/** Полоса словами одной строкой — подсказка номера на PIECES и строка ключа печати. */
export const sewnWords = (tiles: readonly SewnTile[]): string =>
  tiles
    .map(
      (t) =>
        (t.kind === 'empty'
          ? `${t.word} not set`
          : t.kind === 'stitch' && t.iso
            ? `ISO ${t.word}`
            : t.word) + (t.kind !== 'empty' && t.std ? ' (std)' : ''),
    )
    .join(' · ');

/** Полоса коротко — строка ключа на бумаге: «LS 301 · press open · topstitch 6 mm ×2». */
export const sewnShort = (tiles: readonly SewnTile[]): string =>
  tiles
    .map((t) => {
      if (t.kind === 'empty') return `${t.word} not set`;
      if (t.kind === 'section') return t.word.split(' · ').pop() ?? t.word;
      if (t.kind === 'stitch') return t.iso ? t.word : t.word.replace(/\s+\d[\d\s/]*$/, '');
      if (t.kind === 'finish') return '';
      if (t.kind === 'topstitch') return `ts ${t.word}`;
      return t.word;
    })
    .filter(Boolean)
    .join(' ');
