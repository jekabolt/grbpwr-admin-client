import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { Button, ConfirmationModal, GenericPopover, Input, Text } from 'ui';
import { AiPanel, useNoteAssistant, type AiSuggestion } from './ai-panel';
import { BlockSheet } from './block-sheet';
import { MarkdownView } from './markdown-view';
import { insertBlock, replaceBlock, splitBlocks } from './note-blocks';

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
 * от неё и ничего про блоки не знают. Лист пишет в буфер НА КАЖДЫЙ СИМВОЛ (см. `written`):
 * открытая правка не живёт отдельно, и перезагрузка, ⌘S, save/discard видят её как обычную.
 * Блок не тронут — буфер не трогается вовсе (поле `textarea` отдаёт `\n` вместо `\r\n`, и
 * «открыл и закрыл» иначе переписало бы концы строк).
 *
 * Края (`prefix`/`suffix`) снимаются один раз при открытии, и запись — чистая функция черновика:
 * никаких поисков блока по номеру или тексту потом. Если буфер поменялся НЕ листом (discard,
 * перечитка при конфликте, помощник), края устарели — лист закрывается, а не пишет поверх.
 */

interface SheetState {
  /** Номер блока в `base`; у нового не нужен. */
  at: number;
  insert: boolean;
  /** Буфер в момент открытия. */
  base: string;
  /** Всё до и после правимого места в `base`; у нового разделители уже внутри. */
  prefix: string;
  suffix: string;
  /** Исходные байты блока (пусто для нового). */
  raw: string;
  label: string;
  /** Смена ключа — новый лист с чистым черновиком. */
  key: number;
}

/** Метка места вставки: `insertBlock` расставляет разделители, а края режутся по ней.
 * Символ, которого в тексте нет (U+0000 и т. п. в заметке бывают), — иначе `indexOf` найдёт чужой. */
function freeSlot(text: string): string {
  for (let c = 0xe000; c <= 0xf8ff; c++) {
    const ch = String.fromCharCode(c);
    if (!text.includes(ch)) return ch;
  }
  throw new Error('no free slot');
}

function sheetForBlock(text: string, at: number, key: number): SheetState | null {
  const b = splitBlocks(text)[at];
  if (!b) return null;
  return {
    at,
    insert: false,
    base: text,
    prefix: text.slice(0, b.start),
    suffix: text.slice(b.end),
    raw: text.slice(b.start, b.end),
    label: b.kind,
    key,
  };
}

/** Новый блок после блока `after` (-1 — в начало). */
function sheetForInsert(text: string, after: number, key: number): SheetState {
  const slot = freeSlot(text);
  const joined = insertBlock(text, splitBlocks(text), after, slot);
  const cut = joined.indexOf(slot);
  return {
    at: -1,
    insert: true,
    base: text,
    prefix: joined.slice(0, cut),
    suffix: joined.slice(cut + slot.length),
    raw: '',
    label: 'new',
    key,
  };
}

/** Буфер при данном черновике листа. Пустой черновик — блока нет (у нового — буфер как был). */
function written(s: SheetState, draft: string): string {
  if (!s.insert && draft === asField(s.raw)) return s.base;
  const body = toSource(draft, s.raw);
  if (body) return s.prefix + body + s.suffix;
  return s.insert ? s.base : replaceBlock(s.base, splitBlocks(s.base), s.at, '');
}

/** Где кончается то, что лист сейчас держит в буфере: под ним встаёт «add below». */
function sheetEnd(s: SheetState, draft: string): number {
  const body = toSource(draft, s.raw);
  if (!s.insert && draft === asField(s.raw)) return s.prefix.length + s.raw.length;
  return body ? s.prefix.length + body.length : s.prefix.length;
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

  /** Буфер, который лист ждёт увидеть: всё прочее — правка не листом. */
  const expected = useRef(value);
  const open = (next: SheetState | null) => {
    expected.current = next?.base ?? value;
    setSheet(next);
  };
  useEffect(() => {
    if (sheet && value !== expected.current) setSheet(null);
  }, [sheet, value]);

  const write = (s: SheetState, draft: string): string => {
    const next = written(s, draft);
    expected.current = next;
    if (next !== value) onChange(next);
    return next;
  };

  const openBlock = (i: number) => {
    setSelected(i);
    open(sheetForBlock(value, i, (sheet?.key ?? 0) + 1));
  };

  const sheetMenu = (s: SheetState) => (draft: string) => [
    {
      label: 'add below',
      run: () => {
        const text = write(s, draft);
        const end = sheetEnd(s, draft);
        // Под последним блоком того, что набрано (набранное могло стать двумя блоками); если
        // блок опустел и ушёл — под предыдущим.
        const after = splitBlocks(text).findLastIndex((b) => b.end <= end);
        open(sheetForInsert(text, after, s.key + 1));
      },
    },
    {
      label: 'delete block',
      run: () => {
        write(s, '');
        setSelected(null);
        open(null);
      },
    },
    { label: 'wrap lines', on: wrapLines, run: () => onWrapLinesChange(!wrapLines) },
  ];

  /* ── помощник: в режиме блоков — только вся заметка ─────────────────────────────────────── */

  const working = assistant.state.kind === 'working';
  const accept = (s: AiSuggestion) => {
    // Пока помощник работал, буфер могли поправить: предложение построено по прошлой версии.
    if (value !== s.before) {
      showMessage('text changed — ask again', 'error');
      return;
    }
    onChange(s.after);
    assistant.applied(value, s.after, s.scope);
  };
  const revert = (previous: string, next: string) => {
    if (value !== next) {
      showMessage('edited since — no revert', 'error');
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
                        openBlock(i);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        openBlock(i);
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
            onClick={() => open(sheetForInsert(value, blocks.length - 1, (sheet?.key ?? 0) + 1))}
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
          onDraft={(draft) => write(sheet, draft)}
          onDone={() => open(null)}
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
