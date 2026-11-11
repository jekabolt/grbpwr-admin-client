import { adminService } from 'api/api';
import {
  mapFormToModelInsert,
  mapModelToForm,
  type ModelFormData,
} from 'components/managers/model/components/schema';
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { notify } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CascadeList, MetaWord } from 'ui';
import { useUpdateModel } from './useModelQuery';

const GENDERS = [
  { value: 'GENDER_ENUM_MALE', label: 'Men' },
  { value: 'GENDER_ENUM_FEMALE', label: 'Women' },
  { value: 'GENDER_ENUM_UNISEX', label: 'Unisex' },
];

/** `xs_44ta_m` → `XS`, `42.5` stays: the code before the system suffix. */
function shortSize(name: string) {
  return name.split('_')[0].toUpperCase();
}

/**
 * A FIELD OF A STORED MODEL WRITTEN FROM THE POOL. `UpdateModel` replaces the whole model, and a
 * pool card holds a list copy that may be minutes old — so every write reads the model afresh
 * (`GetModel`), changes the one field and sends that. Nobody else's edit of another field is lost.
 */
export function useModelPatch() {
  const update = useUpdateModel();
  const patch = useCallback(
    async (id: number, change: Partial<ModelFormData>) => {
      try {
        const fresh = (await adminService.GetModel({ id })).model;
        if (!fresh) throw new Error('model was deleted');
        const model = mapFormToModelInsert({ ...mapModelToForm(fresh), ...change });
        await update.mutateAsync({ id, model });
      } catch (e) {
        notify({
          sev: 'error',
          subject: `MODEL ${id}`,
          text: 'not saved',
          detail: e instanceof Error ? e.message : undefined,
        });
      }
    },
    [update],
  );
  return { patch, busy: update.isPending };
}

/**
 * THE META ROW OF A MODEL CARD — `Gender: [ Men ]` at the left, `Sizes: [ S, M ]` at the right —
 * as the Taskboard system's header words: with `onGender` / `onSizes` they are in-place editors.
 * Gender opens a compact cascade list at its own (left) side and writes on the pick; Sizes opens
 * the size list at the right, several can be marked, and the set is written once, when the list
 * closes. A click on the card, outside it, Esc or the other word closes the open list.
 */
export function ModelMeta({
  gender,
  sizeIds,
  onGender,
  onSizes,
  busy,
  className,
}: {
  gender: string | undefined;
  sizeIds: number[] | undefined;
  onGender?: (gender: string) => void;
  onSizes?: (ids: number[]) => void;
  busy?: boolean;
  className?: string;
}) {
  const names = useSizeNames();
  const ids = useMemo(() => sizeIds ?? [], [sizeIds]);
  const [editor, setEditor] = useState<'gender' | 'sizes' | null>(null);
  const [draft, setDraft] = useState<number[] | null>(null);
  const shownIds = draft ?? ids;
  const live = useRef({ editor, draft, ids, onSizes });
  live.current = { editor, draft, ids, onSizes };
  const close = useCallback((next: 'gender' | 'sizes' | null = null) => {
    const now = live.current;
    if (now.draft && now.editor === 'sizes' && next !== 'sizes') {
      const same =
        now.draft.length === now.ids.length && now.draft.every((id) => now.ids.includes(id));
      if (!same) now.onSizes?.(now.draft);
      setDraft(null);
    }
    setEditor(next);
  }, []);
  const root = useRef<HTMLDivElement>(null);
  const sizeList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editor) return undefined;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) close(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(null);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [editor, close]);
  // The size list scrolls by itself: the pool's stepping row must not take its wheel.
  useEffect(() => {
    const node = sizeList.current;
    if (!node) return undefined;
    const own = (e: WheelEvent) => e.stopPropagation();
    node.addEventListener('wheel', own, { passive: true });
    return () => node.removeEventListener('wheel', own);
  }, []);

  const genderLabel = GENDERS.find((g) => g.value === gender)?.label;
  const short = [...new Set(shownIds.map((id) => shortSize(names.get(id) ?? `#${id}`)))];
  const sizeOptions = useMemo(
    () => [...names.entries()].map(([id, name]) => ({ value: String(id), label: name })),
    [names],
  );
  const can = !busy;
  return (
    <div
      ref={root}
      className={cn('flex flex-col', className)}
      onClick={editor ? (e) => (e.stopPropagation(), close(null)) : undefined}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className='flex shrink-0 items-baseline justify-between gap-3'>
        <MetaWord
          label='Gender'
          value={genderLabel ?? 'Set'}
          tone={genderLabel ? undefined : 'quiet'}
          active={editor === 'gender'}
          dim={editor === 'sizes'}
          onClick={onGender && can ? () => close(editor === 'gender' ? null : 'gender') : undefined}
        />
        <MetaWord
          label='Sizes'
          value={short.length ? short.join(', ') : 'Set'}
          tone={short.length ? undefined : 'quiet'}
          active={editor === 'sizes'}
          dim={editor === 'gender'}
          onClick={onSizes && can ? () => close(editor === 'sizes' ? null : 'sizes') : undefined}
        />
      </div>
      {onGender && (
        <CascadeList
          label='gender'
          size='compact'
          open={editor === 'gender'}
          options={GENDERS}
          value={gender}
          onChange={(v) => {
            if (v !== gender) onGender(v);
            setEditor(null);
          }}
        />
      )}
      {onSizes && (
        <div
          ref={sizeList}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'overflow-y-auto overscroll-contain transition-[max-height] duration-700 ease-soft [scrollbar-width:none] motion-reduce:transition-none [&::-webkit-scrollbar]:hidden',
            editor === 'sizes' ? 'max-h-36' : 'max-h-0',
          )}
        >
          <CascadeList
            label='sizes'
            size='compact'
            align='right'
            multiple
            open={editor === 'sizes'}
            options={sizeOptions}
            values={shownIds.map(String)}
            onChange={(v) => {
              const id = Number(v);
              setDraft(
                shownIds.includes(id) ? shownIds.filter((x) => x !== id) : [...shownIds, id],
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
