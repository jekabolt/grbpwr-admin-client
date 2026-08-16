import { useEffect, useRef, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { techCardSchema, TechCardFormData } from './schema';
import { PersistedStaging } from './useTechCardStaging';

// Autosave draft (Q9b). Persists the tech-card form to localStorage as the user edits and offers to
// restore it next time the form opens, so leaving the route (to /materials, /fitting, the product
// manager…) or a hard refresh no longer loses unsaved work.
//
// Purely client-side: the draft never touches the server, so it does NOT bump the card's
// lock_version (§2.12 — an autosave tick must not provoke a false optimistic-lock conflict for a
// second editor). The optimistic lock still guards the real save.

// `staging` carries the sub-panel edits that are staged but not yet committed (19.6). Optional, so
// a draft written before phase 19 still parses — and so a panel that cannot rebuild itself from a
// snapshot simply contributes nothing rather than blocking the restore.
type StoredDraft = {
  savedAt: number;
  data: TechCardFormData;
  staging?: PersistedStaging;
  /** Отпечаток набора полей формы на момент записи. Отсутствует у черновиков до этой правки. */
  shape?: string;
};

// ВЕРСИЯ В КЛЮЧЕ, А НЕ МОЛЧАЛИВОЕ СТИРАНИЕ. Черновик, записанный ДО операционных фотографий, не
// несёт поля `media` на операциях — восстановленный, он уехал бы командой «сотри все снимки со
// всех шагов» при первом же сохранении. Общего механизма мержа отсутствующих ключей с карточкой
// здесь нет, и городить его ради одного поля несоразмерно; поднятая версия просто не предлагает
// старые черновики. Цена — потеря несохранённых правок одним релизом, и она честнее.
const PREFIX = 'plm.techcard.draft.v2.';
const LEGACY_PREFIX = 'plm.techcard.draft.';

/**
 * ОТПЕЧАТОК НАБОРА ПОЛЕЙ — ЧТОБЫ ПОДНЯТЬ ВЕРСИЮ БЫЛО НЕЛЬЗЯ ЗАБЫТЬ.
 *
 * Версия в ключе выше защищает ОПЕРАЦИИ: у них нет стабильного ключа, поэтому правило «нет ключа —
 * возьми с карточки» (оно есть у деталей и у выносок) для них невыразимо, и единственная защита от
 * «черновик записан до поля X» — не предлагать такой черновик вовсе. Механизм рабочий, но РУЧНОЙ:
 * он требует помнить о нём при каждом новом поле. Его уже один раз забыли — `pieceLineKey` на
 * выноске добавился после последнего подъёма версии.
 *
 * Отпечаток снимает это с человека. Он считается из САМОЙ СХЕМЫ, а не из значения: у пустой
 * карточки массивы пусты, и поля строки операции в значении просто отсутствуют — то есть ровно то,
 * что теряется, в отпечаток бы и не попало. Схема же перечисляет их всегда.
 *
 * Хэш ни с чем внешним не сравнивается и не обязан быть стойким — важно единственное: он меняется
 * вместе с составом формы. Если интроспекция когда-нибудь перестанет работать (zod сменит форму
 * `_def`), отпечаток выродится в константу, и поведение вернётся к сегодняшнему — черновики
 * принимаются, как принимались. Молчаливой поломки здесь быть не может.
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

const FORM_SHAPE = shapeFingerprint();

/** Только для пробы: отпечаток и список путей, из которых он посчитан. */
export const __draftShapeForTest = () => ({ shape: FORM_SHAPE, paths: schemaFieldPaths() });

/**
 * Одноразовая выметка черновиков прошлой версии.
 *
 * Поднятая версия ключа делает их невидимыми, но НЕ удаляет: они остаются в localStorage
 * навсегда и продолжают занимать квоту, а запись черновика ошибки квоты глотает — то есть
 * автосейв однажды заглох бы молча. Выметается один раз за загрузку модуля.
 */
let sweptLegacy = false;
function sweepLegacyDrafts() {
  if (sweptLegacy) return;
  sweptLegacy = true;
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_PREFIX) && !k.startsWith(PREFIX)) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* приватный режим или запрещённое хранилище — не повод мешать работе */
  }
}
const DEBOUNCE_MS = 800;

export function useTechCardDraft(
  form: UseFormReturn<TechCardFormData>,
  key: string,
  enabled: boolean,
  // Phase 19: sub-panels stage into the card's save instead of owning one, so their edits are
  // unsaved work the unload guard must cover too, and the autosave has to carry them. Passed in
  // rather than read from the staging context so this hook stays usable outside a provider.
  hasStagedChanges = false,
  staging?: {
    serialize: () => PersistedStaging;
    hydrate: (persisted: PersistedStaging | null) => void;
  },
) {
  sweepLegacyDrafts();
  const storageKey = PREFIX + key;
  const [pending, setPending] = useState<StoredDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // On open (or when the key changes): surface an existing draft for restore.
  useEffect(() => {
    if (!enabled) {
      setPending(null);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      const draft = raw ? (JSON.parse(raw) as StoredDraft) : null;
      // ЧЕРНОВИК, ГДЕ У ДЕТАЛИ НЕТ line_key, НЕ ВОССТАНАВЛИВАЕТСЯ ВООБЩЕ — он выбрасывается.
      //
      // Такой черновик записан до появления стабильного ключа детали (0168), то есть ему многие
      // месяцы. Опознать в нём детали нечем: сопоставление по ИМЕНИ верно ровно до первого
      // переименования, а обмен именами между двумя деталями оно принимает молча — строки
      // рецепта, замеры и алиасы переехали бы на чужие детали, и ни одна проверка бы не
      // возразила. Без ключа же сохранение чеканит новые ULID: сервер видит прежние детали
      // исчезнувшими и сносит их каскадом, вместе с рецептом и площадями.
      //
      // Цена отказа — потерянная незаписанная правка полугодовой давности, о которой оператор
      // не помнит. Цена восстановления — тихо испорченная карточка. Сегодняшний черновик под это
      // правило не попадает: ключ чеканится и ручным заведением, и модалкой сопоставления DXF.
      const keyless =
        Array.isArray(draft?.data?.pieces) &&
        draft.data.pieces.some((p) => !(p?.lineKey ?? '').trim());
      if (keyless) {
        localStorage.removeItem(storageKey);
        setPending(null);
        return;
      }
      // ЧЕРНОВИК ЧУЖОЙ ФОРМЫ НЕ ПРЕДЛАГАЕТСЯ. Отпечаток меняется от всякого нового поля, а поля
      // операции переносить с карточки не по чему — у операции нет стабильного ключа. Восстановить
      // такой черновик значит уехать на сервер с zod-дефолтом там, где поля не было, то есть с
      // командой «сотри». Пусто у черновиков, записанных до этой проверки, — они тоже не наши.
      if (draft && draft.shape !== FORM_SHAPE) {
        localStorage.removeItem(storageKey);
        setPending(null);
        return;
      }
      setPending(draft);
    } catch {
      setPending(null);
    }
  }, [storageKey, enabled]);

  // draftPayload — единственное место, где черновик превращается в строку.
  //
  // assemblyCleared ВЫЧЁРКИВАЕТСЯ ЗДЕСЬ. Это намерение ОДНОГО сохранения, а черновик — «правки на
  // потом»: восстановить намерение, которое, возможно, уже исполнено, значит открыть дыру мимо
  // серверного бекстопа. Худший сценарий именно такой — снял разметку, сохранил, другая вкладка
  // разметила заново, восстановил черновик: взведённый флаг попадает в РАЗРЕШЁННУЮ серверную
  // клетку и молча стирает чужую свежую разметку.
  //
  // Хелпер общий для ОБОИХ писателей (правки формы и правки сабпанелей) намеренно: вычеркнуть
  // флаг в одном из них — значит не вычеркнуть его вовсе.
  const draftPayload = (values: TechCardFormData, st: typeof staging) => {
    const { assemblyCleared: _spent, mediaCleared: _spentMedia, ...data } = values;
    return JSON.stringify({
      savedAt: Date.now(),
      data,
      staging: st?.serialize() ?? [],
      shape: FORM_SHAPE,
    });
  };

  // Persist on change (debounced), but only once the user has actually edited (isDirty) — merely
  // opening a card and clicking around must not write a redundant draft.
  useEffect(() => {
    if (!enabled) return;
    const sub = form.watch(() => {
      if (!form.formState.isDirty) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        try {
          // assemblyCleared В ЧЕРНОВИК НЕ ПОПАДАЕТ НИКОГДА (см. draftPayload). Это намерение ОДНОГО сохранения, а
          // черновик — «незаписанные правки на потом»: восстановить намерение, которое, возможно,
          // уже исполнено, значит открыть дыру мимо серверного бекстопа. Худший сценарий именно
          // такой: снял разметку, сохранил, другая вкладка разметила заново — восстановленный
          // черновик со взведённым флагом попадает в РАЗРЕШЁННУЮ серверную клетку и молча стирает
          // чужую свежую разметку.
          //
          // Цена отказа мала и громкая: черновик, где кнопку нажали, но не сохранили, вернётся с
          // распакованными входами и без флага — сервер откажет бекстопом с внятной подсказкой
          // «нажмите снять разметку», и пользователь нажмёт её снова.
          localStorage.setItem(storageKey, draftPayload(form.getValues(), staging));
        } catch {
          /* quota / serialization — best-effort, ignore */
        }
      }, DEBOUNCE_MS);
    });
    return () => {
      sub.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storageKey, enabled, form, staging]);

  // The form's watch never fires for a sub-panel edit (they live outside RHF), so a card whose ONLY
  // unsaved work is staged would autosave nothing and the restore banner would lie about its count.
  useEffect(() => {
    if (!enabled || !hasStagedChanges) return;
    const t = setTimeout(() => {
      try {
        // ТОТ ЖЕ хелпер, что у соседнего писателя. Писателей черновика ДВА (правки формы и
        // правки сабпанелей), и вычеркнуть потраченный флаг в одном из них значит не вычеркнуть
        // его вовсе: достаточно снять разметку, тронуть сабпанель — и в localStorage ляжет
        // снимок со взведённым намерением.
        localStorage.setItem(storageKey, draftPayload(form.getValues(), staging));
      } catch {
        /* quota / serialization — best-effort, ignore */
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [storageKey, enabled, hasStagedChanges, form, staging]);

  // Warn before a hard unload (refresh / tab close) with unsaved edits. In-app route changes are
  // covered by the restore banner instead (the draft survives the navigation).
  const isDirty = form.formState.isDirty || hasStagedChanges;
  useEffect(() => {
    if (!enabled || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled, isDirty]);

  const clear = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setPending(null);
  };
  // Restore into the form but keep it dirty (so Save stays enabled) by preserving the loaded
  // defaults — isDirty is then computed as draft ≠ loaded card.
  const restore = () => {
    if (!pending) return;
    // A draft written by an OLDER build has no idea about fields added since, and zod fills them
    // with their empty defaults — which the save path then sends as deliberate values. For the
    // DXF↔fabric bindings and the block→piece aliases that means «unbind everything» and «the
    // alias set is empty», silently deleting work done elsewhere with no 409 to stop it (the
    // lock version comes from the fresh card query, not from the draft). So anything the draft
    // does not actually carry is taken from the loaded card instead of from a default.
    const loaded = form.getValues();
    const data = { ...pending.data } as typeof pending.data;
    // ПРАВИЛО, А НЕ СПИСОК ПОЛЕЙ. Здесь стояли три имени — `patterns`, `pieceDxfAliases`, `pieces` —
    // ровно те, по которым успели обжечься. Их роднит не смысл, а МЕХАНИКА: всё на этой форме
    // уезжает полной заменой, поэтому ЛЮБОЕ поле, которого в черновике нет, после zod-дефолта
    // превращается не в молчание, а в приказ «сотри». Список закрывал вчерашние поля и не закрывал
    // завтрашние — а завтрашнее поле и есть тот случай, когда черновик написан ДО него: парк
    // оборудования (0306) добавили, старый черновик пришёл без ключа, и «восстановить» отправляло
    // пустые списки профилей как осознанное «удалить все».
    //
    // Ключ, которого в черновике НЕТ, — это не выбор оператора, это возраст черновика: RHF отдаёт
    // getValues() по defaultValues, а те собраны zod-маппером, так что у черновика СЕГОДНЯШНЕЙ
    // сборки есть все ключи (форма не ставит shouldUnregister, размонтированная вкладка значение не
    // теряет). Значит «ключа нет» ⇒ «черновик старше поля» ⇒ брать с карточки. Пустое значение при
    // ПРИСУТСТВУЮЩЕМ ключе — наоборот, правка, ради которой черновик и существует, и не трогается.
    for (const key of Object.keys(loaded) as Array<keyof typeof loaded>) {
      if (!(key in (pending.data as object))) (data as Record<string, unknown>)[key] = loaded[key];
    }
    // И ТО ЖЕ ПРАВИЛО НА ЯРУС ГЛУБЖЕ, для одной секции — construction. Она единственная на этой
    // форме, кто держит под собой самостоятельную сущность: `equipmentDefaults` — это парк карточки,
    // и его ПРИСУТСТВИЕ в пакете означает «заменить парк целиком» (пустой — «удалить все профили»).
    // Черновик, снятый до 0306, несёт секцию конструкции без этого ключа, и верхнего правила ему
    // мало: ключ `construction` в черновике ЕСТЬ. Итог был бы худшим из возможных — молча снесённые
    // профили (включая заведённые миграцией), отцепленные ссылки шагов и протухшая подпись секции,
    // и всё это на карточке, которую оператор открыл ради заметки полугодовой давности.
    if (data.construction && loaded.construction) {
      const merged = { ...data.construction } as Record<string, unknown>;
      let changed = false;
      for (const k of Object.keys(loaded.construction) as Array<keyof typeof loaded.construction>) {
        if (k in (data.construction as object)) continue;
        merged[k] = loaded.construction[k];
        changed = true;
      }
      if (changed) data.construction = merged as typeof data.construction;
    }
    // `patterns` may exist but predate the binding column; carry it per row, by identity.
    if (Array.isArray(data.patterns) && Array.isArray(loaded.patterns)) {
      // Loaded rows are registered under BOTH identities, because the two sides cannot agree on
      // one: every STORED row has a lineKey (0260 backfilled LEGACY… keys and the store mints one
      // for anything still without), while a draft old enough to need this carry-forward is by
      // definition from a build whose schema had no lineKey at all. Keying the map by lineKey
      // alone therefore missed every single row it existed to match — the fallback was dead code
      // for exactly its own case, and the merge silently unbound the whole card.
      const bindingByKey = new Map<string, { bomLineKey: string; fabricPurpose: string }>();
      for (const p of loaded.patterns) {
        if (!p.bomLineKey && !p.fabricPurpose) continue;
        const binding = { bomLineKey: p.bomLineKey ?? '', fabricPurpose: p.fabricPurpose ?? '' };
        const lk = p.lineKey?.trim();
        if (lk) bindingByKey.set(lk, binding);
        bindingByKey.set(`${p.sizeId ?? 0}|${p.url ?? ''}`, binding);
      }
      data.patterns = data.patterns.map((p) => {
        // ОБЕ половины привязки, а не одна. С 0267 выкройка ведёт на НАЗНАЧЕНИЕ, а строка
        // осталась совместимостью. Черновик, снятый до 0267, несёт bomLineKey и НЕ несёт
        // fabricPurpose — прежняя проверка «поле есть, значит черновик свежий» пропускала такую
        // строку как есть, zod подставлял '', и сохранение читало это как «очистить назначение».
        // На карточке, которую с тех пор разложили, это стирало привязку у всех выкроек разом.
        const hasPurpose = typeof p.fabricPurpose === 'string';
        const hasLine = typeof p.bomLineKey === 'string';
        if (hasPurpose && hasLine) return p;
        const lk = p.lineKey?.trim();
        const carried =
          (lk ? bindingByKey.get(lk) : undefined) ??
          bindingByKey.get(`${p.sizeId ?? 0}|${p.url ?? ''}`);
        return {
          ...p,
          bomLineKey: hasLine ? p.bomLineKey : (carried?.bomLineKey ?? ''),
          fabricPurpose: hasPurpose ? p.fabricPurpose : (carried?.fabricPurpose ?? ''),
        };
      });
    }
    // Алиасы деталей — тот же перенос, и он ВАЖНЕЕ. Набор алиасов пишется полной заменой, а
    // строка, у которой пусты обе половины привязки, ОТБРАСЫВАЕТСЯ фильтром на сохранении —
    // то есть у алиаса, привязанного к назначению с несколькими строками, восстановление
    // черновика не «отвязывало» бы его, а удаляло с сервера.
    if (Array.isArray(data.pieceDxfAliases) && Array.isArray(loaded.pieceDxfAliases)) {
      const scopeByBlock = new Map<string, { bomLineKey: string; fabricPurpose: string }>();
      for (const a of loaded.pieceDxfAliases) {
        const block = (a.blockName ?? '').trim().toLowerCase();
        if (!block) continue;
        scopeByBlock.set(`${a.bomLineKey ?? ''}|${block}`, {
          bomLineKey: a.bomLineKey ?? '',
          fabricPurpose: a.fabricPurpose ?? '',
        });
      }
      data.pieceDxfAliases = data.pieceDxfAliases.map((a) => {
        if (typeof a.fabricPurpose === 'string') return a;
        const block = (a.blockName ?? '').trim().toLowerCase();
        const carried = scopeByBlock.get(`${a.bomLineKey ?? ''}|${block}`);
        return { ...a, fabricPurpose: carried?.fabricPurpose ?? '' };
      });
    }
    // ДЕТАЛИ КРОЯ — ПЕРЕНОС ПО ПОЛЯМ, а не по строке (находка 3 второго адверсарного ревью).
    //
    // У «× на изделие» и «как кроится» в карточке БОЛЬШЕ НЕТ РЕДАКТОРА: единственный их автор —
    // модалка «детали кроя из DXF», которая читает ответ из чертежа. Оба поля при этом уезжают на
    // провод ВСЕГДА (см. маппер `pieces` в schema.ts): явный `_UNKNOWN` сервер понимает как команду
    // «очисти колонку», а не как молчание. Значит черновик, снятый до появления поля (или потерявший
    // его по любой другой причине), после zod-дефолта превращается в приказ стереть разметку — и
    // одна посторонняя правка карточки обнуляет её у ВСЕХ деталей разом, без единого сообщения и без
    // контрола, которым это можно было бы вернуть.
    //
    // Лечится ОТСУТСТВИЕ КЛЮЧА, а не значение: поле, которое в черновике есть, уезжает как есть —
    // включая пустое и `false`, — иначе восстановление отменяло бы правку, ради которой черновик и
    // существует.
    //
    // ПЕРЕНОСИТСЯ ВСЁ, ЧЕГО В СТРОКЕ НЕТ, а не список полей (находка 3 третьего адверсарного
    // ревью). Список из двух имён закрывал ровно те два поля, которые заметили, — а старый черновик
    // так же не несёт `ungraded`, `fusingMode`, `fusingWidthMm` и любое поле, которое появится
    // завтра. Все они уезжают на провод КРУГЛЫМ РЕЙСОМ (см. маппер `pieces` в schema.ts), то есть
    // zod-дефолт на месте отсутствующего поля — это не молчание, а команда снять значение. Правило
    // «нет ключа — возьми с карточки» закрывает и будущие поля; список пришлось бы дописывать при
    // каждом, и один раз его забудут.
    //
    // Ключ сопоставления один — `lineKey`. Черновик, снятый ДО его появления, сюда не доходит:
    // он выброшен при загрузке (гард выше), потому что опознать в нём детали НЕЧЕМ. Сохранять его
    // было опасно с обеих сторон: без ключа маппер минтит НОВЫЙ ULID (`p.lineKey?.trim() ||
    // ulid()`), и сервер сносит прежние детали вместе со строками рецепта и площадями (а при живых
    // алиасах роняет сохранение на `piece_line_key: not_found`); сопоставление же по имени — не
    // идентичность: переименование рвёт связь, а обмен именами между двумя деталями переносит
    // рецепты и алиасы на чужие детали молча, не нарушив ни одной проверки.
    if (Array.isArray(data.pieces) && Array.isArray(loaded.pieces)) {
      type LoadedPiece = NonNullable<typeof loaded.pieces>[number];
      const loadedByKey = new Map<string, LoadedPiece>();
      for (const p of loaded.pieces) {
        const lk = p.lineKey?.trim().toLowerCase();
        if (lk) loadedByKey.set(lk, p);
      }
      // Сопоставление ТОЛЬКО по line_key — и другого здесь быть не может. Сопоставлять по имени
      // соблазнительно (оно уникально в пределах карточки), но имя не идентичность: переименование
      // рвёт связь, а обмен именами между двумя деталями подменяет её молча. Черновик без ключа
      // сюда не доходит — он выброшен при загрузке, см. гард выше.
      const claimed = new Set<LoadedPiece>();
      data.pieces = data.pieces.map((p) => {
        const lk = (p.lineKey ?? '').trim().toLowerCase();
        const from = lk ? loadedByKey.get(lk) : undefined;
        // Ключа нет на карточке — это законно новая деталь черновика (её завела модалка
        // сопоставления или ручное заведение), и все свои поля она проставила явно. Переносить
        // нечего.
        if (!from || claimed.has(from)) return p;
        claimed.add(from);
        const merged = { ...p } as Record<string, unknown>;
        let changed = false;
        for (const k of Object.keys(from)) {
          if (k in (p as object)) continue;
          merged[k] = (from as Record<string, unknown>)[k];
          changed = true;
        }
        return (changed ? merged : p) as typeof p;
      });
    }
    // ВЫНОСКИ ЭСКИЗА: та же болезнь, что у деталей выше, и то же лекарство. С 0309 указание несёт
    // вид, якоря и цвет, и все три уезжают на провод КРУГЛЫМ РЕЙСОМ — значит zod-дефолт на месте
    // отсутствующего ключа это не молчание, а команда «сделай обратно точкой». Черновик, снятый до
    // геометрии (или любым бандлом, который её не знает), после восстановления стёр бы КАЖДУЮ
    // мерку и скобку на эскизе — сохранением, которое эскиз даже не открывало.
    //
    // Ключ сопоставления — НОМЕР выноски: другой идентичности у неё нет, и именно номером на неё
    // ссылаются деталь, операция и дефект. Тем же номером переносит хранимую геометрию сервер
    // (CarryOmittedCalloutGeometry), так что обе стороны сопоставляют одинаково.
    if (Array.isArray(data.callouts) && Array.isArray(loaded.callouts)) {
      type LoadedCallout = NonNullable<typeof loaded.callouts>[number];
      const loadedByNumber = new Map<number, LoadedCallout>();
      for (const c of loaded.callouts) {
        const n = c.number ?? 0;
        // Первый выигрывает: номера уникальны по смыслу, а дубль — испорченные данные, на которых
        // перенос обязан быть детерминированным.
        if (n > 0 && !loadedByNumber.has(n)) loadedByNumber.set(n, c);
      }
      data.callouts = data.callouts.map((c) => {
        const from = loadedByNumber.get(c.number ?? 0);
        // Номера нет на карточке — выноска заведена в самом черновике, и все свои поля она
        // проставила явно. Переносить нечего.
        if (!from) return c;
        const merged = { ...c } as Record<string, unknown>;
        let changed = false;
        for (const k of Object.keys(from)) {
          if (k in (c as object)) continue;
          merged[k] = (from as Record<string, unknown>)[k];
          changed = true;
        }
        return (changed ? merged : c) as typeof c;
      });
    }

    // ОПЕРАЦИИ: pieceLineKeys → inputKeys (0307). Черновик, снятый до узлов сборки, несёт входы
    // шага под старым именем, и восстановление БЕЗ этого переноса стало бы командой «сотри все
    // привязки деталей к шагам»: restore заканчивается form.reset(data) МИМО mapTechCardToForm,
    // поэтому фолбэк на уровне маппера сюда не достаёт, а маппер записи коэрсит отсутствующее
    // поле в пустой массив и отправляет его как осознанное «удалить».
    //
    // Перенос ПОЛЯ ВНУТРИ ОДНОГО И ТОГО ЖЕ объекта операции, а не сопоставление строк по
    // индексу: у операции нет стабильного ключа, и сопоставлять было бы не по чему — но здесь
    // сопоставлять и не нужно, объект тот же самый. Поэтому у этого переноса нет цены, в отличие
    // от keyless-гарда выше, который черновик отбрасывает.
    if (Array.isArray(data.operations)) {
      data.operations = data.operations.map((o) => {
        const raw = o as Record<string, unknown>;
        if (Array.isArray(raw.inputKeys) || !Array.isArray(raw.pieceLineKeys)) return o;
        const { pieceLineKeys, ...rest } = raw;
        return { ...rest, inputKeys: (pieceLineKeys as string[]).filter(Boolean) } as typeof o;
      });
    }

    // СТРАХОВКА ВТОРОГО РУБЕЖА. Черновики, записанные сборками до вычёркивания, уже лежат в
    // localStorage со взведённым флагом, и правило «отсутствующий ключ берём с карточки» их не
    // спасает — ключ там ЕСТЬ. Намерение снять разметку не восстанавливается никогда: если оно
    // ещё актуально, его объявляют кнопкой заново.
    (data as Record<string, unknown>).assemblyCleared = false;
    (data as Record<string, unknown>).mediaCleared = false;

    form.reset(data, { keepDefaultValues: true });
    // Seed the sub-panel snapshots BEFORE clearing `pending`. hydrate() also bumps the staging
    // identity, which is what makes an ALREADY-MOUNTED panel re-run its claim effect and adopt its
    // snapshot — every tab body is mounted from page load, so without that bump the claim had
    // already run against an empty map and the restore dropped every staged sub-panel edit.
    staging?.hydrate(pending.staging ?? null);
    setPending(null);
  };
  const dismiss = () => setPending(null);

  return { pending, restore, dismiss, clear };
}
