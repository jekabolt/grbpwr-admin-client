import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useFilesWritable } from 'lib/stores/files-mode';
import { useSnackBarStore } from 'lib/stores/store';
import { ROUTES, SECTION } from 'constants/routes';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { filesService } from '../api/filesService';
import { byteLength, noteErrorText, NOTE_MAX_BYTES, notesService } from '../api/notesService';
import { isForbidden, isUnknownRoute } from '../api/rpc-error';
import { NoAccessState } from '../components/gallery-states';
import { filesKeys, useLibraryFile } from '../hooks/useFiles';
import { formatBytes, formatWhenShort, stemOf } from '../utils/format';
import { MarkdownView } from './markdown-view';
import { NoteDiff } from './note-diff';
import { NoteEditor, type NoteEditorHandle } from './note-editor';
import { readNoteDraft, useNoteDraft } from './use-note-draft';

/**
 * ЭКРАН ЗАМЕТКИ (вариант md=v3 макета).
 *
 * Открывается ЧТЕНИЕМ во всю ширину вьюпорта, а не редактором в колонке: заметку в девяти
 * случаях из десяти открывают почитать. Правка включается по ⌘E и выключается по Esc.
 *
 * ── ТРИ ВЕЩИ, РАДИ КОТОРЫХ ЭКРАН УСТРОЕН ИМЕННО ТАК ─────────────────────────────────────────
 *
 * 1. МОЛЧАЛИВОЙ ПЕРЕЗАПИСИ НЕ БЫВАЕТ. Сохранение едет с отпечатком той версии, ОТ КОТОРОЙ
 *    произошёл буфер. Разошёлся отпечаток — сервер отвечает конфликтом ДАННЫМИ (вместе с чужим
 *    текстом целиком), и человек получает выбор из трёх исходов, а не отказ.
 * 2. ЧУЖОЙ ОТПЕЧАТОК НЕ ПОДБИРАЕТСЯ АВТОМАТИЧЕСКИ. После конфликта база сравнения остаётся
 *    прежней: если бы клиент принял `current_sha256` за новую базу, следующее нажатие «сохранить»
 *    прошло бы сравнение и стёрло чужую версию — то есть ровно то, от чего вся конструкция и
 *    защищает, но на один шаг позже. Записать поверх можно только явно, кнопкой с подтверждением.
 * 3. ЧТЕНИЕ ПОКАЗЫВАЕТ БУФЕР, А НЕ СОХРАНЁННЫЙ ТЕКСТ. Esc из правки не должен выглядеть как
 *    «мой текст пропал»: в чтении остаётся то, что набрано, и pill «не сохранено» вместе с
 *    кнопкой сохранения никуда не деваются.
 */

/**
 * Адрес экрана. Роут прописывает оркестратор (`ROUTES` и `index.tsx` — не в этой задаче), а до
 * тех пор путь живёт здесь одной строкой: T-8.9 («открыть» у `.md` из карточки и с плитки) берёт
 * его отсюда, чтобы адрес существовал в одном месте, а не в трёх.
 */
export function notePath(id: number): string {
  return `/files/${id}/note`;
}

/** Ключ содержимого. Под общим префиксом `files`, чтобы разбор кэша раздела доставал и его. */
function noteContentKey(id: number) {
  return [...filesKeys.all, 'note-content', id] as const;
}

interface ConflictState {
  content: string;
  by: string;
  at: string;
}

export function NotePage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const { canRead, canWrite, resolved } = usePermissions();

  const mayRead = !resolved || canRead(SECTION.files);
  const writable = useFilesWritable(canWrite(SECTION.files));

  const fileQuery = useLibraryFile(Number.isFinite(id) && id > 0 ? id : undefined);
  const file = fileQuery.data?.file;

  const contentQuery = useQuery({
    queryKey: noteContentKey(id),
    queryFn: () => notesService.getContent(id),
    enabled: Number.isFinite(id) && id > 0 && mayRead,
    // Текст заметки — не presigned-ссылка, протухать ему нечем; перечитывать его на каждом
    // возврате на вкладку значило бы гонять сотни килобайт ради текста, который меняется руками.
    staleTime: 5 * 60 * 1000,
  });

  /* ── буфер ────────────────────────────────────────────────────────────────────────────── */

  const [value, setValue] = useState('');
  const [name, setName] = useState('');
  /** Текст, лежащий на сервере: по нему считается «не сохранено». */
  const [serverContent, setServerContent] = useState('');
  /** Отпечаток версии, от которой произошёл буфер, — база сравнения при записи. */
  const [base, setBase] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedLabel, setSavedLabel] = useState('');
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [savingSeparate, setSavingSeparate] = useState(false);
  const editorRef = useRef<NoteEditorHandle | null>(null);

  const draft = useNoteDraft(Number.isFinite(id) && id > 0 ? id : undefined);
  const [draftOffer, setDraftOffer] = useState<{ content: string; base: string; at: number } | null>(
    null,
  );

  /** Буфер засевается ОДИН РАЗ на заметку. Фоновое перечитывание не имеет права переписать то,
   * что человек уже набрал, — а именно это делал бы простой `useEffect` на данные запроса. */
  const seededRef = useRef<number | null>(null);
  useEffect(() => {
    const loaded = contentQuery.data;
    if (!loaded || !Number.isFinite(id) || seededRef.current === id) return;
    seededRef.current = id;
    const text = loaded.content ?? '';
    setValue(text);
    setServerContent(text);
    setBase(loaded.sha256 ?? '');
    setEditing(false);
    setConflict(null);
    setShowDiff(false);

    // ЧЕРНОВИК НЕ ПОДСТАВЛЯЕТСЯ МОЛЧА. Он может быть старше того, что за это время сохранил
    // кто-то другой, и тихая подстановка превратила бы «я вернулся на вкладку» в откат чужой
    // работы. Совпал с сервером — восстанавливать нечего, ключ просто убирается.
    //
    // Читается ЗДЕСЬ И СИНХРОННО, а не из состояния хука: при переходе между двумя заметками
    // без размонтирования состояние долетело бы только следующим рендером, и этот эффект принял
    // бы чужой (пустой) снимок за «черновика нет» — а следующий эффект стёр бы ключ новой
    // заметки, ни разу его не показав.
    const offer = readNoteDraft(id);
    if (offer && offer.content !== text) {
      setDraftOffer(offer);
    } else {
      // Предложение от ПРОШЛОЙ заметки обязано уйти вместе с ней: без этого баннер про
      // «несохранённый черновик» переезжал бы на соседнюю заметку и предлагал бы влить в неё
      // чужой текст.
      setDraftOffer(null);
      if (offer) draft.clear();
    }
  }, [contentQuery.data, draft, id]);

  // Имя правится в режиме правки и уезжает обычным UpdateLibraryFile. Засевается из файла и
  // так же однократно.
  const nameSeededRef = useRef<number | null>(null);
  useEffect(() => {
    if (!file?.id || nameSeededRef.current === file.id) return;
    nameSeededRef.current = file.id;
    setName(file.fileName ?? '');
  }, [file]);

  const contentDirty = value !== serverContent;
  const nameDirty = !!file && name.trim() !== (file.fileName ?? '') && !!name.trim();
  const dirty = contentDirty || nameDirty;

  const bytes = useMemo(() => byteLength(value), [value]);
  const tooBig = bytes > NOTE_MAX_BYTES;

  // Черновик пишется по мере набора и снимается, как только буфер сравнялся с сервером.
  //
  // ПОКА ПРЕДЛОЖЕНИЕ ВОССТАНОВИТЬ НЕ ЗАКРЫТО — НЕ СНИМАЕТСЯ. Сразу после открытия буфер равен
  // серверному тексту, то есть «не грязный», и без этой оговорки экран стирал бы черновик в тот
  // же миг, когда предлагает его восстановить: ответить на предложение человек ещё не успел, а
  // перезагрузка вкладки уже не нашла бы ничего.
  useEffect(() => {
    if (!Number.isFinite(id) || seededRef.current !== id) return;
    if (contentDirty) draft.write(value, base);
    else if (!draftOffer) draft.clear();
  }, [base, contentDirty, draft, draftOffer, id, value]);

  /* ── сохранение ───────────────────────────────────────────────────────────────────────── */

  const save = useCallback(
    async (force: boolean) => {
      if (!file?.id || saving) return;
      // Право проверяется ЗДЕСЬ, а не только на кнопках. Баннер конфликта живёт и в чтении, и
      // переживает Esc: без этой строки «всё равно записать поверх» оставался бы нажимаемым
      // после того, как раздел переключили в режим чтения, — обход заморозки писателей.
      if (!writable) return;
      if (tooBig) {
        showMessage(
          `заметка весит ${formatBytes(bytes)} при пределе ${formatBytes(NOTE_MAX_BYTES)} — сервер такую не примет`,
          'error',
        );
        return;
      }
      setSaving(true);
      try {
        if (contentDirty || force) {
          const res = await notesService.saveContent({
            fileId: file.id,
            content: value,
            baseSha256: base,
            force,
          });
          if (res.conflict) {
            // НИЧЕГО НЕ ЗАПИСАНО. Чужой текст приезжает целиком — второго запроса не нужно, и
            // база сравнения СОЗНАТЕЛЬНО остаётся прежней (см. шапку файла, пункт 2).
            setConflict({
              content: res.currentContent ?? '',
              by: res.lastEditedBy ?? '',
              at: res.lastEditedAt ?? '',
            });
            return;
          }
          setServerContent(value);
          setBase(res.currentSha256 ?? '');
          setConflict(null);
          setShowDiff(false);
          draft.clear();
          setSavedLabel(
            new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          );
          qc.setQueryData(noteContentKey(file.id), {
            ...(contentQuery.data ?? {}),
            content: value,
            sha256: res.currentSha256,
          });
        }
        if (nameDirty) {
          // Темы уезжают СВЕЖИЕ, а не пустые и не из кэша: UpdateLibraryFile заменяет набор
          // целиком, пустой список снял бы с заметки все ярлыки заодно с переименованием, а
          // кэш файла живёт 30 минут — за это время коллега успевает повесить свой ярлык, и
          // переименование сняло бы его молча, без всякого экрана конфликта. Поэтому файл
          // перечитывается вплотную к записи.
          const fresh = await fileQuery.refetch();
          const topics = fresh.data?.file?.topics ?? file.topics ?? [];
          await filesService.updateFile({
            id: file.id,
            fileName: name.trim(),
            topicIds: topics.map((t) => t.id ?? 0).filter(Boolean),
            newTopics: [],
          });
        }
        qc.invalidateQueries({ queryKey: filesKeys.file(file.id) });
        qc.invalidateQueries({ queryKey: [...filesKeys.all, 'list'] });
      } catch (e) {
        showMessage(noteErrorText(e, 'не удалось сохранить заметку'), 'error');
      } finally {
        setSaving(false);
      }
    },
    [
      base,
      bytes,
      contentDirty,
      contentQuery.data,
      draft,
      file,
      fileQuery,
      name,
      nameDirty,
      qc,
      saving,
      showMessage,
      tooBig,
      value,
      writable,
    ],
  );

  /** «Сохранить как отдельную заметку»: ваш буфер уезжает НОВЫМ файлом, чужая версия остаётся
   * на месте. Единственный исход конфликта, в котором не теряет никто. */
  const saveSeparately = useCallback(async () => {
    if (!file?.id || savingSeparate || !writable) return;
    if (tooBig) {
      // Тот же потолок, что и у обычной записи: исход «где не теряет никто» не должен быть
      // единственным, который выясняет свой отказ дольше всех — уже отправив 512 КиБ.
      showMessage(
        `заметка весит ${formatBytes(bytes)} при пределе ${formatBytes(NOTE_MAX_BYTES)} — сервер такую не примет`,
        'error',
      );
      return;
    }
    setSavingSeparate(true);
    try {
      const copyName = `${stemOf(name || file.fileName || 'заметка')} — моя версия`.slice(0, 240);
      const res = await notesService.createNote({
        fileName: copyName,
        topicIds: (file.topics ?? []).map((t) => t.id ?? 0).filter(Boolean),
        newTopics: [],
        content: value,
      });
      draft.clear();
      qc.invalidateQueries({ queryKey: filesKeys.all });
      const newId = res.file?.id;
      showMessage('ваша версия сохранена отдельной заметкой', 'success');
      if (newId) navigate(notePath(newId));
    } catch (e) {
      showMessage(noteErrorText(e, 'не удалось создать отдельную заметку'), 'error');
    } finally {
      setSavingSeparate(false);
    }
  }, [
    bytes,
    draft,
    file,
    name,
    navigate,
    qc,
    savingSeparate,
    showMessage,
    tooBig,
    value,
    writable,
  ]);

  /* ── горячие клавиши ──────────────────────────────────────────────────────────────────── */

  const canSave = dirty && !tooBig && writable;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (confirmOverwrite) return;
      const mod = e.metaKey || e.ctrlKey;

      // `code`, а не только `key`: на русской раскладке физическая S приходит как «ы», а E как
      // «у». По одному `key` ⌘S проваливался бы мимо — и открывался бы НАТИВНЫЙ диалог
      // сохранения страницы браузером, то есть ровно то, что здесь и перехватывается.
      if (mod && (e.code === 'KeyS' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
        if (!canSave || saving) return;
        void save(false);
        return;
      }
      if (mod && (e.code === 'KeyE' || e.key.toLowerCase() === 'e')) {
        if (!writable) return;
        e.preventDefault();
        setEditing((v) => !v);
        return;
      }
      // Esc сначала предлагают редактору: пока открыт блок помощника, он значит «закрой
      // помощника», и только потом — «выйди из правки».
      if (e.key === 'Escape' && editing) {
        if (editorRef.current?.consumeEscape()) return;
        setEditing(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canSave, confirmOverwrite, editing, save, saving, writable]);

  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing]);

  /* ── отказы ───────────────────────────────────────────────────────────────────────────── */

  if (!mayRead) return <NoAccessState />;

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <PageShell>
        <CalloutBox tone='error' className='bg-bgColor'>
          <Text size='micro'>
            такого адреса заметки не бывает — в нём должен стоять номер файла
          </Text>
        </CalloutBox>
      </PageShell>
    );
  }

  if (contentQuery.isLoading || fileQuery.isLoading) {
    return (
      <PageShell>
        <Toolbar>
          <Text size='micro' variant='label'>
            открываем заметку…
          </Text>
        </Toolbar>
      </PageShell>
    );
  }

  // ЭКРАН ОТКАЗА — ТОЛЬКО ДО ЗАСЕВА. После того как текст один раз приехал, провалившееся
  // фоновое перечитывание (а его запускает даже собственная инвалидация после «сохранить как
  // отдельную заметку») в react-query ставит статус `error` при живых данных — и человек
  // вместо своего редактора с набранным текстом увидел бы «этой заметки нет». Текст остался бы
  // в черновике, но с экрана исчез бы, а очевидного пути назад нет.
  if (contentQuery.isError && seededRef.current !== id) {
    const e = contentQuery.error;
    return (
      <PageShell>
        <CalloutBox tone='error' className='bg-bgColor'>
          <div className='space-y-1.5'>
            <Text size='micro'>
              {isForbidden(e)
                ? 'эту заметку вам не показывают — нужно право files:read или доступ к самому файлу'
                : isUnknownRoute(e)
                  ? // 404 значит и «файла нет», и «шлюз такого не знает»: на стенде без выката
                    // Ф8 это второе. Различить их клиент не может и не притворяется.
                    'этой заметки нет: либо файл удалён, либо бэкенд с заметками ещё не выкачен на этот стенд'
                  : noteErrorText(e, 'заметка не открылась')}
            </Text>
            <div className='flex gap-1.5'>
              <Button size='sm' variant='secondary' onClick={() => contentQuery.refetch()}>
                попробовать ещё раз
              </Button>
              <Button asChild size='sm' variant='secondary'>
                <Link to={`${ROUTES.files}/${id}`}>открыть карточку файла</Link>
              </Button>
            </div>
          </div>
        </CalloutBox>
      </PageShell>
    );
  }

  /* ── шапка чтения ─────────────────────────────────────────────────────────────────────── */

  const editedBy = file?.contentUpdatedBy ?? '';
  const editedAt = formatWhenShort(file?.contentUpdatedAt ?? undefined);
  const meta = editedBy
    ? `правил ${editedBy}${editedAt ? ` · ${editedAt}` : ''}`
    : // Заметка, ни разу не правленная редактором (её залили файлом), честно показывает того,
      // кто её принёс: пустое «правил » выглядело бы как потерянные данные.
      `загрузил ${file?.uploadedBy ?? '—'}${
        formatWhenShort(file?.createdAt ?? undefined)
          ? ` · ${formatWhenShort(file?.createdAt ?? undefined)}`
          : ''
      }`;

  const sizeHint = tooBig
    ? `заметка весит ${formatBytes(bytes)} при пределе ${formatBytes(NOTE_MAX_BYTES)} — сохранение откажет.`
    : bytes > NOTE_MAX_BYTES * 0.9
      ? `осталось ${formatBytes(NOTE_MAX_BYTES - bytes)} до предела заметки.`
      : undefined;

  const banners = (
    <>
      {draft.blocked && (
        <CalloutBox tone='note' className='bg-bgColor'>
          <Text size='micro'>
            браузер не даёт сохранить черновик (приватное окно или переполненное хранилище) — до
            нажатия «сохранить» текст живёт только в этой вкладке
          </Text>
        </CalloutBox>
      )}

      {/* Провал ПЕРЕЧИТЫВАНИЯ уже открытой заметки: экран менять нельзя (там набранный текст),
          но и молчать нельзя — на нём последняя прочитанная версия, а не сегодняшняя. */}
      {contentQuery.isError && (
        <CalloutBox tone='note' className='bg-bgColor'>
          <div className='flex flex-wrap items-baseline gap-2'>
            <Text size='micro' component='span'>
              перечитать заметку не удалось — на экране последняя прочитанная версия, ваш текст
              цел. сохранение при этом всё равно сверит отпечатки.
            </Text>
            <Button
              size='xs'
              variant='secondary'
              className='ml-auto'
              onClick={() => contentQuery.refetch()}
            >
              перечитать
            </Button>
          </div>
        </CalloutBox>
      )}

      {draftOffer && (
        <CalloutBox tone='warning'>
          <div className='flex flex-wrap items-baseline gap-2'>
            <Text size='micro' component='span'>
              <b>в браузере остался несохранённый черновик</b>
              {draftOffer.at ? ` от ${formatWhenShort(new Date(draftOffer.at).toISOString())}` : ''}.
              он не подставлен сам: за это время заметку мог сохранить кто-то другой, и тихая
              подстановка была бы откатом чужой работы.
            </Text>
            <div className='ml-auto flex gap-1.5'>
              <Button
                size='xs'
                variant='secondary'
                onClick={() => {
                  setValue(draftOffer.content);
                  // База берётся ИЗ ЧЕРНОВИКА, а не с сервера: черновик произошёл от той версии,
                  // и подставить свежий отпечаток значило бы пройти сравнение под чужой правкой.
                  setBase(draftOffer.base);
                  setDraftOffer(null);
                  setEditing(true);
                }}
              >
                восстановить
              </Button>
              <Button
                size='xs'
                variant='secondary'
                onClick={() => {
                  draft.clear();
                  setDraftOffer(null);
                }}
              >
                отбросить
              </Button>
            </div>
          </div>
        </CalloutBox>
      )}

      {conflict && (
        <CalloutBox tone='warning'>
          <div className='space-y-stack'>
            <Text size='micro' component='span'>
              <b>{conflict.by || 'кто-то'} сохранил свою версию, пока вы правили.</b> ваш текст
              остался здесь и никуда не делся — записано ничего не было. запись поверх сотрёт его
              правки{formatWhenShort(conflict.at) ? ` от ${formatWhenShort(conflict.at)}` : ''}.
              посмотрите, что изменилось, и решите.
            </Text>
            <div className='flex flex-wrap gap-1.5'>
              <Button size='sm' variant='secondary' onClick={() => setShowDiff((v) => !v)}>
                {showDiff ? 'скрыть различия' : 'показать различия'}
              </Button>
              <Button
                size='sm'
                variant='secondary'
                disabled={savingSeparate}
                onClick={saveSeparately}
              >
                {savingSeparate ? 'создаём…' : 'сохранить как отдельную заметку'}
              </Button>
              <Button size='sm' variant='secondary' onClick={() => setConfirmOverwrite(true)}>
                всё равно записать поверх
              </Button>
            </div>
          </div>
        </CalloutBox>
      )}

      {conflict && showDiff && (
        <Section
          title='что разошлось'
          question='— чем именно ваша версия отличается от сохранённой'
        >
          <NoteDiff theirs={conflict.content} mine={value} theirsBy={conflict.by} />
        </Section>
      )}
    </>
  );

  return (
    <PageShell>
      {editing ? (
        <NoteEditor
          handleRef={editorRef}
          name={name}
          onNameChange={setName}
          value={value}
          onChange={setValue}
          dirty={dirty}
          saving={saving}
          savedLabel={savedLabel}
          canSave={canSave}
          onSave={() => void save(false)}
          onLeaveEdit={() => setEditing(false)}
          sizeHint={sizeHint}
          banners={banners}
        />
      ) : (
        <>
          <Toolbar>
            {/* Имя берётся из ПОЛЯ, а не из файла: переименовали, вышли по Esc — в шапке
                обязано стоять то, что сохранится, иначе pill «не сохранено» относился бы к
                чему-то невидимому. */}
            <Text component='h1' size='large'>
              {name || file?.fileName || 'заметка'}
            </Text>
            <Text size='micro' variant='label' component='span'>
              {meta}
            </Text>
            <ToolbarSpacer />
            {dirty && <Pill tone='attention'>не сохранено</Pill>}
            {file?.downloadUrl && (
              <Button asChild size='sm' variant='secondary'>
                <a href={file.downloadUrl}>скачать .md</a>
              </Button>
            )}
            <Button asChild size='sm' variant='secondary'>
              <Link to={`${ROUTES.files}/${id}`}>карточка файла</Link>
            </Button>
            {writable ? (
              <>
                {dirty && (
                  <Button
                    size='sm'
                    variant='secondary'
                    disabled={!canSave || saving}
                    onClick={() => void save(false)}
                  >
                    {saving ? 'сохраняем…' : 'сохранить ⌘s'}
                  </Button>
                )}
                <Button size='sm' variant='main' onClick={() => setEditing(true)}>
                  править ⌘e
                </Button>
              </>
            ) : (
              <Text size='micro' variant='label' component='span'>
                только чтение
              </Text>
            )}
          </Toolbar>

          {banners}

          <div className='min-h-[50vh] border border-borderColor bg-bgColor p-block'>
            {value.trim() ? (
              <MarkdownView source={value} />
            ) : (
              <Text size='micro' variant='label'>
                заметка пока пустая{writable ? ' — ⌘e, и можно писать' : ''}
              </Text>
            )}
          </div>
        </>
      )}

      <ConfirmationModal
        open={confirmOverwrite}
        onOpenChange={setConfirmOverwrite}
        onConfirm={() => void save(true)}
        title='записать поверх'
        confirmLabel='записать поверх'
        cancelLabel='не записывать'
        width='sm'
      >
        <Text>
          версия, которую сохранил {conflict?.by || 'коллега'}, будет заменена вашим текстом и
          восстановить её будет неоткуда. если нужны обе — закройте это окно и выберите «сохранить
          как отдельную заметку».
        </Text>
      </ConfirmationModal>
    </PageShell>
  );
}

/**
 * Оболочка страницы. Ширину НЕ ограничивает: вариант md=v3 занят на всю ширину вьюпорта
 * сознательно, и колонка на 74 знака здесь была бы другим вариантом макета.
 *
 * Белым НЕ красит: серый холст — это и есть разделитель между блоками, и обёртка, залившая его
 * белым, стёрла бы все границы разом.
 */
function PageShell({ children }: { children: React.ReactNode }) {
  return <div className='flex flex-col gap-gutter pb-gutter'>{children}</div>;
}

export default NotePage;
