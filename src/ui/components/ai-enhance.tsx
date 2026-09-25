import { useEffect, useRef, useState } from 'react';

import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import GenericPopover from 'ui/components/popover';

/**
 * ═══ AI ENHANCE — ОДНА ТИХАЯ КНОПКА В УГЛУ СВОБОДНОГО ТЕКСТА ═══════════════════════════════════
 *
 * Волна 2026-09-25 (tmp/plans/techcard-ux-0925/04-DEEP-03-ai-enhance.md). Владелец: «на всех
 * таких полях типа note или DESCRIPTION в мудборде добавить снизу справа кнопку ai enhance… поправить
 * ошибки, написать более детально или наоборот короче».
 *
 * ФОРМА: ровно одна кнопка `ai ✦` в правом нижнем углу обёртки поля; клик открывает поповер с
 * тремя строками (improve · expand · shorten). Ответ ЗАМЕНЯЕТ текст поля через `onApply`, и на
 * десять секунд рядом появляется `undo ↶` — вернуть, что было. Никаких второй кнопки, переключателей
 * режимов и превью: поле само и есть превью, а откат — одна дверь.
 *
 * СЕТЬ: `enhanceText` — единственный адрес RPC `EnhanceText` (POST /api/admin/ai/enhance-text).
 * Пока типы не сгенерированы, функция честно бросает `AI_NOT_WIRED`; зона CL-E заменяет тело на
 * `adminService.EnhanceText`. Компонент этого не знает и меняться не должен.
 *
 * ОБЁРТКА ПОЛЯ: родитель делает `relative` и даёт textarea `pb-7`, чтобы последняя строка текста
 * не уезжала под кнопку. `maxRunes` — лимит поля назначения (2000 у DESCRIPTION/WORDS/NOTE): сервер
 * клампит ответ по границе предложения, а не режет посреди слова.
 */
export type EnhanceMode = 'improve' | 'expand' | 'shorten';

/** Что за поле — закрытый список (сервер держит такой же enum; свободный текст в промпт не идёт). */
export type EnhanceField = 'description' | 'note' | 'words' | 'silhouette' | 'fabric' | 'other';

export const ENHANCE_MODES: ReadonlyArray<{ mode: EnhanceMode; label: string; hint: string }> = [
  { mode: 'improve', label: 'improve', hint: 'fix errors, make it clearer' },
  { mode: 'expand', label: 'expand', hint: 'more detail' },
  { mode: 'shorten', label: 'shorten', hint: 'to the point' },
];

export type EnhanceRequest = {
  text: string;
  mode: EnhanceMode;
  field: EnhanceField;
  /** Факты карточки (`cardFactsContext`), без картинок. */
  context?: string;
  /** Лимит поля назначения; сервер не вернёт длиннее. */
  maxRunes?: number;
};

export class EnhanceRefusal extends Error {
  constructor(
    public readonly reason: 'AI_NOT_CONFIGURED' | 'AI_MODEL_UNAVAILABLE' | 'AI_NOT_WIRED' | 'OTHER',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Единственная дверь к серверу. ЗОНА CL-E: заменить тело на вызов `adminService.EnhanceText`
 * (маппинг mode/field → enum'ы контракта, `ErrorInfo.reason` → `EnhanceRefusal.reason`),
 * не меняя сигнатуру.
 */
export async function enhanceText(_req: EnhanceRequest, _signal?: AbortSignal): Promise<string> {
  throw new EnhanceRefusal('AI_NOT_WIRED', 'AI enhance is not wired to the server yet');
}

const UNDO_WINDOW_MS = 10_000;

export function AiEnhance({
  value,
  onApply,
  field,
  context,
  maxRunes,
  disabled,
  className,
}: {
  value: string | null | undefined;
  /** Получает новый текст; родитель пишет его в поле (setValue с shouldDirty). */
  onApply: (text: string) => void;
  field: EnhanceField;
  context?: string;
  maxRunes?: number;
  disabled?: boolean;
  className?: string;
}) {
  const { showMessage } = useSnackBarStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Что стояло в поле до замены — пока жив, рисуется `undo ↶`. */
  const [prev, setPrev] = useState<{ before: string; after: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const undoTimer = useRef<number | null>(null);

  // Ручная правка после замены снимает откат: возвращать «что было» поверх чужой правки нельзя.
  useEffect(() => {
    if (prev && (value ?? '') !== prev.after) setPrev(null);
  }, [value, prev]);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
    },
    [],
  );

  const empty = !(value ?? '').trim();

  const run = async (mode: EnhanceMode) => {
    setOpen(false);
    const before = value ?? '';
    if (!before.trim() || busy) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    try {
      const after = await enhanceText({ text: before, mode, field, context, maxRunes }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const next = after.trim();
      if (!next) {
        showMessage('the model returned nothing — the text is unchanged', 'error');
        return;
      }
      onApply(next);
      setPrev({ before, after: next });
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setPrev(null), UNDO_WINDOW_MS);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const r = e instanceof EnhanceRefusal ? e.reason : 'OTHER';
      showMessage(
        r === 'AI_NOT_CONFIGURED'
          ? 'AI is off on this server'
          : r === 'AI_MODEL_UNAVAILABLE'
            ? 'the AI model is unavailable right now'
            : r === 'AI_NOT_WIRED'
              ? 'AI enhance is not wired yet'
              : `could not enhance: ${e instanceof Error ? e.message : String(e)}`,
        'error',
      );
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };

  const undo = () => {
    if (!prev) return;
    onApply(prev.before);
    setPrev(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  };

  return (
    <div className={cn('absolute bottom-1.5 right-1.5 flex items-center gap-1.5', className)} data-ai-enhance>
      {prev && (
        <Chip onClick={undo} title='put the previous text back'>
          undo ↶
        </Chip>
      )}
      <GenericPopover
        open={open}
        onOpenChange={setOpen}
        noTail
        contentProps={{ align: 'end', side: 'top' }}
        triggerProps={{ 'aria-label': 'ai enhance', disabled: disabled || busy || empty }}
        openElement={
          <Button
            asChild
            variant='secondary'
            size='xs'
            disabled={disabled || busy || empty}
            title={empty ? 'write something first' : busy ? 'working…' : 'ai enhance: improve, expand or shorten'}
            className='bg-bgColor'
          >
            <span>{busy ? 'ai …' : 'ai ✦'}</span>
          </Button>
        }
      >
        <ul className='flex flex-col' role='menu' aria-label='ai enhance'>
          {ENHANCE_MODES.map((m) => (
            <li key={m.mode} role='none'>
              <button
                type='button'
                role='menuitem'
                onClick={() => run(m.mode)}
                className='flex w-full items-baseline gap-2 px-2 py-1.5 text-left hover:bg-bgSecondary'
              >
                <span className='text-micro uppercase tracking-label text-textColor'>{m.label}</span>
                <span className='text-micro text-labelColor'>· {m.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </GenericPopover>
    </div>
  );
}
