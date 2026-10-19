import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { Button, ConfirmationModal, GenericPopover, Input, Text } from 'ui';
import { AiPanel, useNoteAssistant, type AiSuggestion } from './ai-panel';
import { BlockSheet } from './block-sheet';
import { MarkdownView } from './markdown-view';
import { insertBlock, replaceBlock, splitBlocks, type NoteBlock } from './note-blocks';

/**
 * ПРАВКА ЗАМЕТКИ ПО БЛОКАМ — телефон (<md), вариант «Blocks» (выбор владельца 2026-10-19).
 *
 * Заметка читается списком блоков; касание открывает лист, который правит ТОЛЬКО этот блок.
 * Старое сырое поле живёт в «•••» → edit as text (большая вставка, перестройка).
 *
 * ── НА ВЕСЬ ЭКРАН ───────────────────────────────────────────────────────────────────────────
 *
 * Слой — порталом в `body`, `fixed inset-0` на уровне модалок: навигация админки (`--z-nav`)
 * остаётся под ним, и шапка «done · имя · save» стоит первой строкой экрана. Сама вёрстка
 * админки не трогается. Диалоги страницы (save/discard, конфликт) открываются ПОЗЖЕ слоя и
 * встают поверх него тем же уровнем, порядком в `body`.
 *
 * ── ПРАВКА МЕНЯЕТ ТОЛЬКО СВОЙ ДИАПАЗОН ──────────────────────────────────────────────────────
 *
 * Буфер — та же строка `value` страницы: сохранение, конфликт по отпечатку и черновик работают
 * от неё и ничего про блоки не знают. Блок не тронут — буфер не трогается вовсе (поле `textarea`
 * отдаёт `\n` вместо `\r\n`, и «открыл и закрыл» иначе переписало бы концы строк).
 */

interface SheetState {
  /** Номер блока; для нового — после какого вставлять (-1 — в начало). */
  at: number;
  insert: boolean;
  /** Исходные байты блока в момент открытия (пусто для нового). */
  raw: string;
  label: string;
  /** Смена ключа — новый лист с чистым черновиком. */
  key: number;
}

/** Как браузерное поле видит исходник: только `\n`. */
function asField(raw: string): string {
  return raw.replace(/\r\n?/g, '\n');
}

/** Набранное — обратно в байты исходника: без пустых строк по краям (они — разделители),
 * и с `\r\n`, если блок был таким. */
function toSource(draft: string, raw: string): string {
  const body = draft.replace(/^\n+/, '').replace(/\n+$/, '');
  if (!body.trim()) return '';
  if (!raw.includes('\r')) return body;
  return body.replace(/\n/g, '\r\n') + (raw.endsWith('\r') ? '\r' : '');
}

export function NoteBlocksView({
  name,
  onNameChange,
  value,
  onChange,
  dirty,
  saving,
  canSave,
  onSave,
  onLeave,
  onEditAsText,
  wrapLines,
  onWrapLinesChange,
  sizeHint,
  banners,
}: {
  name: string;
  onNameChange: (next: string) => void;
  value: string;
  onChange: (next: string) => void;
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  /** «done» шапки — общий выход из правки (при несохранённом — окно save/discard). */
  onLeave: () => void;
  onEditAsText: () => void;
  wrapLines: boolean;
  onWrapLinesChange: (next: boolean) => void;
  sizeHint?: string;
  banners?: React.ReactNode;
}) {
  const { showMessage } = useSnackBarStore();
  const assistant = useNoteAssistant();
  const blocks = useMemo(() => splitBlocks(value), [value]);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  /** Последний открытый блок — чернильная полоса слева, чтобы видно было, где был. */
  const [selected, setSelected] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);

  // Страница под слоем не прокручивается: жест по пустому месту слоя иначе уводил бы её.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = before;
    };
  }, []);

  const openBlock = (i: number, b: NoteBlock) => {
    const raw = value.slice(b.start, b.end);
    setSelected(i);
    setSheet((s) => ({ at: i, insert: false, raw, label: b.kind, key: (s?.key ?? 0) + 1 }));
  };

  /**
   * Новый текст буфера после листа, или `null` — менять нечего.
   *
   * Блок ищется ЗАНОВО по текущему буферу и сверяется с тем, что открывали: пока лист был
   * открыт, буфер мог перечитаться с сервера (чистый буфер подхватывает чужую версию), и правка
   * по старым границам разрезала бы чужой текст.
   */
  const commit = useCallback(
    (s: SheetState, draft: string): string | null => {
      const list = splitBlocks(value);
      if (s.insert) {
        const body = toSource(draft, '');
        return body ? insertBlock(value, list, Math.min(s.at, list.length - 1), body) : null;
      }
      if (draft === asField(s.raw)) return null;
      const b = list[s.at];
      if (!b || value.slice(b.start, b.end) !== s.raw) {
        showMessage('the note changed while the block was open — open it again', 'error');
        return null;
      }
      return replaceBlock(value, list, s.at, toSource(draft, s.raw));
    },
    [showMessage, value],
  );

  const apply = (s: SheetState, draft: string): string => {
    const next = commit(s, draft);
    if (next !== null && next !== value) onChange(next);
    return next ?? value;
  };

  const sheetMenu = (s: SheetState) => (draft: string, close: () => void) => [
    {
      label: 'add below',
      run: () => {
        close();
        const before = splitBlocks(value).length;
        const next = apply(s, draft);
        const grew = splitBlocks(next).length - before;
        // Куда встаёт новый: под последним блоком того, что набрано (набранное могло стать
        // двумя блоками); если блок опустел и ушёл — под предыдущим.
        const after = s.at + grew;
        setSheet({ at: after, insert: true, raw: '', label: 'new', key: s.key + 1 });
      },
    },
    {
      label: 'delete block',
      run: () => {
        close();
        if (!s.insert) {
          const list = splitBlocks(value);
          const b = list[s.at];
          if (b && value.slice(b.start, b.end) === s.raw)
            onChange(replaceBlock(value, list, s.at, ''));
          else showMessage('the note changed while the block was open — open it again', 'error');
        }
        setSelected(null);
        setSheet(null);
      },
    },
    { label: 'wrap lines', on: wrapLines, run: () => onWrapLinesChange(!wrapLines) },
  ];

  /* ── помощник: в режиме блоков — только вся заметка ─────────────────────────────────────── */

  const working = assistant.state.kind === 'working';
  const accept = (s: AiSuggestion) => {
    // Пока помощник работал, буфер могли поправить: предложение построено по прошлой версии.
    if (value !== s.before) {
      showMessage(
        'the text changed while the assistant was working — the suggestion is built on the previous version, ask again',
        'error',
      );
      return;
    }
    onChange(s.after);
    assistant.applied(value, s.after, s.scope);
  };
  const revert = (previous: string, next: string) => {
    if (value !== next) {
      showMessage(
        'the text has already been edited since accepting — the revert would erase those edits, so it refuses',
        'error',
      );
      return;
    }
    onChange(previous);
    assistant.dismiss();
  };

  const menu: { label: string; run: () => void; disabled?: boolean; on?: boolean }[] = [
    { label: 'rename', run: () => setRenameDraft(name) },
    { label: 'edit as text', run: onEditAsText },
    {
      label: 'tidy with ai',
      run: () => assistant.run({ text: value, range: null }),
      disabled: working || !value.trim(),
    },
    { label: 'wrap lines', on: wrapLines, run: () => onWrapLinesChange(!wrapLines) },
  ];

  return (
    <>
      {createPortal(
        <div className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-pageBg text-textColor md:hidden'>
          <div className='flex min-h-13 shrink-0 items-center gap-2 border-b border-borderColor bg-bgColor px-1.5'>
            <Button size='sm' variant='underline' className='min-h-11 shrink-0' onClick={onLeave}>
              done
            </Button>
            <div className='flex min-w-0 flex-1 items-center justify-center gap-1.5'>
              <span
                role='img'
                aria-label={dirty ? 'not saved' : 'saved'}
                className={cn('size-1.5 shrink-0', dirty ? 'bg-error' : 'bg-success')}
              />
              <Text component='span' className='min-w-0 truncate font-bold'>
                {name || 'note'}
              </Text>
            </div>
            {dirty && (
              <Button
                size='sm'
                variant='main'
                className='min-h-11 shrink-0'
                disabled={!canSave || saving}
                onClick={onSave}
              >
                {saving ? 'saving…' : 'save'}
              </Button>
            )}
            <GenericPopover
              open={menuOpen}
              onOpenChange={setMenuOpen}
              noTail
              className='w-48'
              contentProps={{ align: 'end' }}
              triggerProps={{
                'aria-label': 'note actions',
                className:
                  'flex min-h-11 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              }}
              openElement={
                <Button asChild size='sm' variant='secondary'>
                  <span aria-hidden>•••</span>
                </Button>
              }
            >
              <div role='menu' className='-mx-2 -my-1.5 flex flex-col divide-y divide-hairline'>
                {menu.map((item) => (
                  <Button
                    key={item.label}
                    size='sm'
                    role={item.on === undefined ? 'menuitem' : 'menuitemcheckbox'}
                    aria-checked={item.on}
                    disabled={item.disabled}
                    className='flex min-h-11 w-full items-center justify-between text-left hover:bg-pageBg'
                    onClick={() => {
                      setMenuOpen(false);
                      item.run();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.on && <span aria-hidden>✓</span>}
                  </Button>
                ))}
              </div>
            </GenericPopover>
          </div>

          <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain'>
            <div className='flex flex-col gap-gutter pb-24'>
              {sizeHint && (
                <Text size='micro' variant='label' className='px-3 pt-2'>
                  {sizeHint}
                </Text>
              )}
              {banners}
              <AiPanel
                state={assistant.state}
                stale={
                  assistant.state.kind === 'ready' && !assistant.state.suggestion.range
                    ? value !== assistant.state.suggestion.before
                    : false
                }
                onCancel={assistant.cancel}
                onDismiss={assistant.dismiss}
                onAccept={(s) => accept(s)}
                onRevert={revert}
                onRetry={(req) => assistant.run(req)}
              />
              {blocks.length > 0 && (
                <div className='bg-bgColor py-1.5'>
                  {blocks.map((b, i) => (
                    <div
                      key={i}
                      role='button'
                      tabIndex={0}
                      aria-label={`edit ${b.kind}`}
                      // ССЫЛКИ И СНИМКИ В РЕЖИМЕ БЛОКОВ НЕ РАБОТАЮТ: касание по блоку — всегда
                      // правка. Перехват на погружении, до обработчиков ссылки и снимка; переход
                      // по ссылке остаётся в чтении.
                      onClickCapture={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openBlock(i, b);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        openBlock(i, b);
                      }}
                      className={cn(
                        'cursor-pointer border-l-2 px-3 py-1.5 [&_pre]:text-micro',
                        i === selected ? 'border-textColor bg-pageBg' : 'border-transparent',
                      )}
                    >
                      <MarkdownView source={value.slice(b.start, b.end)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button
            size='sm'
            variant='main'
            className='absolute right-3 bottom-3 min-h-11'
            onClick={() =>
              setSheet((s) => ({
                at: blocks.length - 1,
                insert: true,
                raw: '',
                label: 'new',
                key: (s?.key ?? 0) + 1,
              }))
            }
          >
            + add
          </Button>
        </div>,
        document.body,
      )}

      {sheet && (
        <BlockSheet
          key={sheet.key}
          label={sheet.label}
          seed={asField(sheet.raw)}
          wrapLines={wrapLines}
          menu={sheetMenu(sheet)}
          onDone={(draft) => {
            apply(sheet, draft);
            setSheet(null);
          }}
          onLost={(draft) => {
            apply(sheet, draft);
          }}
        />
      )}

      <ConfirmationModal
        open={renameDraft !== null}
        onOpenChange={(open) => {
          if (!open) setRenameDraft(null);
        }}
        onConfirm={() => {
          if (renameDraft !== null) onNameChange(renameDraft);
        }}
        title='rename'
        confirmLabel='rename'
        confirmDisabled={!renameDraft?.trim()}
        width='sm'
      >
        <Input
          name='noteRename'
          value={renameDraft ?? ''}
          autoComplete='off'
          autoCapitalize='off'
          autoCorrect='off'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameDraft(e.target.value)}
        />
      </ConfirmationModal>
    </>
  );
}
