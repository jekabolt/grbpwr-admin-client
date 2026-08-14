import { useEffect, useRef, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { TechCardFormData } from './schema';
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
type StoredDraft = { savedAt: number; data: TechCardFormData; staging?: PersistedStaging };

const PREFIX = 'plm.techcard.draft.';
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
      setPending(draft);
    } catch {
      setPending(null);
    }
  }, [storageKey, enabled]);

  // Persist on change (debounced), but only once the user has actually edited (isDirty) — merely
  // opening a card and clicking around must not write a redundant draft.
  useEffect(() => {
    if (!enabled) return;
    const sub = form.watch(() => {
      if (!form.formState.isDirty) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              savedAt: Date.now(),
              data: form.getValues(),
              staging: staging?.serialize() ?? [],
            }),
          );
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
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            savedAt: Date.now(),
            data: form.getValues(),
            staging: staging?.serialize() ?? [],
          }),
        );
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
    // `pieces` в этом списке по той же причине, что и соседи: массив деталей уезжает на сервер
    // ПОЛНОЙ ЗАМЕНОЙ, и черновик, снятый до появления вкладки деталей, подставил бы пустой набор —
    // то есть удалил бы все детали кроя разом, вместе со строками рецепта колорвеев и замеренными
    // площадями (сервер чистит обе таблицы в той же транзакции).
    const carried = ['patterns', 'pieceDxfAliases', 'pieces'] as const;
    for (const key of carried) {
      if (!(key in (pending.data as object))) (data as Record<string, unknown>)[key] = loaded[key];
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
