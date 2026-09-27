import { techCardSchema } from './schema';

// ═══ ОТПЕЧАТОК СОСТАВА ФОРМЫ (перенесён из useTechCardDraft.ts, 27.09 · O-64, D-63) ═══════════════════
// Локальных черновиков карточки больше нет; отпечаток остался у истории сохранений (save-history.ts):
// снимок, записанный формой другого состава, не наш — и восстанавливать из него нельзя ничего.

/**
 * ОТПЕЧАТОК НАБОРА ПОЛЕЙ — ЧТОБЫ СМЕНУ СОСТАВА ФОРМЫ БЫЛО НЕЛЬЗЯ ПРОПУСТИТЬ.
 *
 * Снимок, записанный формой другого состава, не наш: значения из него уходили бы в форму мимо
 * маппера чтения, и поле, которого в снимке нет, получило бы zod-дефолт — а на сервер уехало бы
 * командой «сотри». Помнить о версии ключа при каждом новом поле — механизм ручной, и его уже один
 * раз забыли: `pieceLineKey` на выноске добавился после последнего подъёма версии черновиков.
 *
 * Отпечаток снимает это с человека. Он считается из САМОЙ СХЕМЫ, а не из значения: у пустой
 * карточки массивы пусты, и поля строки операции в значении просто отсутствуют — то есть ровно то,
 * что теряется, в отпечаток бы и не попало. Схема же перечисляет их всегда.
 *
 * Хэш ни с чем внешним не сравнивается и не обязан быть стойким — важно единственное: он меняется
 * вместе с составом формы. Если интроспекция когда-нибудь перестанет работать (zod сменит форму
 * `_def`), отпечаток выродится в константу, и снимки принимаются, как принимались. Молчаливой
 * поломки здесь быть не может.
 */
function schemaFieldPaths(): string[] {
  const out: string[] = [];
  const unwrap = (node: unknown): any => {
    let cur: any = node;
    for (let i = 0; i < 6; i++) {
      const d = cur?._def ?? cur?.def;
      if (!d) break;
      if (d.innerType) {
        cur = d.innerType;
        continue;
      }
      if (d.element) {
        cur = d.element;
        continue;
      }
      break;
    }
    return cur;
  };
  const walk = (node: unknown, prefix: string, depth: number) => {
    const inner = unwrap(node);
    const shape = inner?.shape;
    // ГЛУБИНА 4, А НЕ 2. Забытый случай был именно на третьем уровне: `pieceLineKey` на выноске
    // снимка шага — это `operations.media.annotations.pieceLineKey`. Отпечаток, обрывающийся выше,
    // не заметил бы ровно того поля, ради которого всё это и написано.
    if (!shape || depth > 4) return;
    for (const key of Object.keys(shape)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.push(path);
      walk(shape[key], path, depth + 1);
    }
  };
  walk(techCardSchema, '', 0);
  return out;
}

function shapeFingerprint(): string {
  let paths: string[] = [];
  try {
    paths = schemaFieldPaths();
  } catch {
    paths = [];
  }
  if (paths.length === 0) return 'introspection-unavailable';
  paths.sort();
  let h = 5381;
  const joined = paths.join('|');
  for (let i = 0; i < joined.length; i++) h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Для истории сохранений (save-history.ts, волна 25.09): снимок, записанный формой другого состава, —
// не наш.
export const FORM_SHAPE = shapeFingerprint();

/** Только для пробы: отпечаток и список путей, из которых он посчитан. */
export const __formShapeForTest = () => ({ shape: FORM_SHAPE, paths: schemaFieldPaths() });
