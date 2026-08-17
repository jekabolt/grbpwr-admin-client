import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useFilesWritable } from 'lib/stores/files-mode';
import { useSnackBarStore } from 'lib/stores/store';
// Адрес заметки НЕ собирается здесь: он живёт в `constants/routes` рядом с самим шаблоном
// маршрута. Второй сборщик того же адреса разошёлся бы с первым молча — маршрут остался бы
// рабочим, а ссылка «сохранить как отдельную заметку» вела бы в никуда.
import { notePath, ROUTES, SECTION } from 'constants/routes';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { filesService } from '../api/filesService';
import { byteLength, NOTE_MAX_BYTES, notesService } from '../api/notesService';
import { failureText, isForbidden, isUnknownRoute } from '../api/rpc-error';
import { FilesDropOverlay } from '../components/drop-overlay';
import { FailureText } from '../components/failure-text';
import { NoAccessState } from '../components/gallery-states';
import { filesKeys, invalidateFileViews, useLibraryFile } from '../hooks/useFiles';
import { formatBytes, formatWhenShort, stemOf } from '../utils/format';
import { MarkdownView } from './markdown-view';
import { NoteDiff } from './note-diff';
import { NoteEditor, type NoteCaret, type NoteEditorHandle } from './note-editor';
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

/** Ключ содержимого. Под общим префиксом `files`, чтобы разбор кэша раздела доставал и его. */
function noteContentKey(id: number) {
  return [...filesKeys.all, 'note-content', id] as const;
}

interface ConflictState {
  content: string;
  by: string;
  at: string;
}

/** Мак отличается тем, что в его текстовых полях живут emacs-привязки: ctrl+e там — «в конец
 * строки», ctrl+a — «в начало». Проверка платформы нужна ровно для того, чтобы не отнимать их. */
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);

/** Живое текстовое поле — то, у которого своя работа с клавишами. */
function isTextField(node: EventTarget | null): boolean {
  const el = node as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'textarea' || tag === 'input' || el.isContentEditable === true;
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
  /** Спрос перед тем, как черновик заменит уже набранное. См. `restoreDraft`. */
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [savingSeparate, setSavingSeparate] = useState(false);
  const editorRef = useRef<NoteEditorHandle | null>(null);
  /** Где стояла каретка на выходе из правки: Esc и обратный ⌘E обязаны вернуть туда же, а не
   * в начало заметки. Живёт здесь, а не в редакторе: редактор на это время размонтирован. */
  const caretRef = useRef<NoteCaret | null>(null);

  const draft = useNoteDraft(Number.isFinite(id) && id > 0 ? id : undefined);
  const [draftOffer, setDraftOffer] = useState<{ content: string; base: string; at: number } | null>(
    null,
  );

  /** Буфер разошёлся с тем, что лежит на сервере. Стоит ВЫШЕ засева намеренно: засев про него
   * спрашивает, и порядок объявления здесь — часть смысла, а не оформление. */
  const contentDirty = value !== serverContent;

  /**
   * Засев буфера прочитанным текстом.
   *
   * ПЕРВЫЙ РАЗ — полный: текст, отпечаток, сброс правки и конфликта, разбор черновика.
   *
   * ДАЛЬШЕ — ТОЛЬКО ПО ЧИСТОМУ БУФЕРУ. Набранное фоновое перечитывание переписывать не имеет
   * права, и раньше здесь стоял глухой запрет на второй засев вообще. Цена оказалась выше:
   * кнопка «перечитать» в баннере отказа гасила баннер, но текст на экране навсегда оставался
   * прошлой версией, а `base` — прошлым отпечатком, и следующее сохранение уезжало в конфликт
   * на ровном месте. Поэтому запрет сужен до трёх случаев, где переписывать действительно
   * нечего: буфер разошёлся с сервером, на экране конфликт, на экране предложение черновика.
   */
  const seededRef = useRef<number | null>(null);
  useEffect(() => {
    const loaded = contentQuery.data;
    if (!loaded || !Number.isFinite(id)) return;
    const text = loaded.content ?? '';
    const fresh = loaded.sha256 ?? '';

    if (seededRef.current === id) {
      if (contentDirty || conflict || draftOffer) return;
      if (text === serverContent && fresh === base) return;
      // Чистый буфер равен серверному тексту, поэтому потерять здесь нечего: меняется ровно
      // то же, что увидел бы читатель, и вместе с текстом обновляется база сравнения.
      setValue(text);
      setServerContent(text);
      setBase(fresh);
      return;
    }

    seededRef.current = id;
    caretRef.current = null;
    setValue(text);
    setServerContent(text);
    setBase(fresh);
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
  }, [base, conflict, contentDirty, contentQuery.data, draft, draftOffer, id, serverContent]);

  /**
   * Имя правится в режиме правки и уезжает обычным UpdateLibraryFile.
   *
   * ЧУЖОЕ ПЕРЕИМЕНОВАНИЕ ПОДХВАТЫВАЕТСЯ, ПОКА СВОЁ ИМЯ НЕ ТРОГАЛИ. Пока засев был однократным,
   * переименование коллеги превращалось в дефект на ровном месте: карточка перечитывалась,
   * `file.fileName` становился новым, поле оставалось старым — и от этого САМА зажигалась
   * плашка «не сохранено», а следующее сохранение молча возвращало старое имя. Нового человек
   * не видел вообще.
   *
   * Если своё имя УЖЕ правили, серверное не подставляется (это стёрло бы набранное), но и
   * молчать нельзя — расхождение показывается баннером `renamedElsewhere`.
   */
  const nameSeededRef = useRef<number | null>(null);
  /** Имя, которое сервер показывал в прошлый раз: по нему видно, трогали ли поле руками. */
  const serverNameRef = useRef('');
  const [renamedElsewhere, setRenamedElsewhere] = useState('');
  useEffect(() => {
    if (!file?.id) return;
    const server = file.fileName ?? '';
    if (nameSeededRef.current !== file.id) {
      nameSeededRef.current = file.id;
      serverNameRef.current = server;
      setRenamedElsewhere('');
      setName(server);
      return;
    }
    if (server === serverNameRef.current) return;
    const untouched = name === serverNameRef.current;
    serverNameRef.current = server;
    if (untouched) setName(server);
    // Серверное имя сравнялось с полем — значит это ПРИЕХАЛО НАШЕ ЖЕ сохранение, а не чужая
    // правка. Без этой ветки баннер зажигался бы после собственного переименования и говорил
    // про коллегу, которого не было.
    else setRenamedElsewhere(server === name.trim() ? '' : server);
  }, [file, name]);

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
        // ОДНОЙ ФУНКЦИЕЙ НА ВЕСЬ РАЗДЕЛ, а не двумя ключами поимённо. Поимённый список
        // накрывал карточку файла и сетку — и проходил мимо витрины открытого
        // (`['files','shared',…]`, staleTime 30 минут: до получаса со старым именем на экране,
        // который существует, чтобы показывать правду о выложенном наружу) и мимо всего дерева
        // задач, откуда рисуется плитка этой же заметки во вложениях карточки. `invalidateFileViews`
        // знает про оба корня и уже используется тремя другими мутациями раздела.
        invalidateFileViews(qc);
      } catch (e) {
        showMessage(failureText(e, 'не удалось сохранить заметку'), 'error');
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
      // Новая заметка — это новый файл библиотеки: он обязан появиться и на витрине, и во
      // вложениях, а не только в сетке. Тот же довод, что у обычного сохранения.
      invalidateFileViews(qc);
      const newId = res.file?.id;
      showMessage('ваша версия сохранена отдельной заметкой', 'success');
      if (newId) navigate(notePath(newId));
    } catch (e) {
      showMessage(failureText(e, 'не удалось создать отдельную заметку'), 'error');
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

  // `!!file?.id` — не украшение: запись идёт ПО НОМЕРУ ФАЙЛА, и без прочитанной карточки
  // `save` выходит первой же строкой. Пока этого условия не было, кнопка «сохранить» оставалась
  // активной и на нажатие не делала ничего и молча — замерено: ноль запросов, ноль сообщений.
  const canSave = dirty && !tooBig && writable && !!file?.id;

  /** Выход из правки. Снимает каретку ДО размонтирования редактора — иначе снимать её будет не с
   * чего, и возврат по ⌘E ставил бы её в начало заметки. */
  const leaveEdit = useCallback(() => {
    caretRef.current = editorRef.current?.caret() ?? caretRef.current;
    setEditing(false);
  }, []);

  /**
   * Подставить черновик в поле.
   *
   * ПО ЧИСТОМУ БУФЕРУ — СРАЗУ, ПО НАБРАННОМУ — ТОЛЬКО С ПОДТВЕРЖДЕНИЕМ. Кнопка работала молча и
   * тогда, когда человек, не ответив баннеру, уже начал печатать: набранное подменялось
   * вчерашним черновиком без следа. Вернуть его было нечем — ⌘Z буфер react не отменяет, а в
   * localStorage к тому времени лежал уже новый текст (черновик пишется по мере набора).
   */
  const restoreDraft = useCallback(() => {
    if (!draftOffer) return;
    setValue(draftOffer.content);
    // База берётся ИЗ ЧЕРНОВИКА, а не с сервера: черновик произошёл от той версии, и подставить
    // свежий отпечаток значило бы пройти сравнение под чужой правкой.
    setBase(draftOffer.base);
    setDraftOffer(null);
    setConfirmRestore(false);
    setEditing(true);
  }, [draftOffer]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (confirmOverwrite || confirmRestore) return;
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
        // CTRL+E ВНУТРИ ПОЛЯ НА МАКЕ — ЧУЖАЯ КЛАВИША. Там это штатное «в конец строки» (emacs-
        // привязки живут во всех текстовых полях системы), и перехват выбрасывал человека из
        // правки посреди набора. ⌘E остаётся везде; на прочих системах Ctrl+E остаётся тоже —
        // там он ничего не значит.
        if (IS_MAC && e.ctrlKey && !e.metaKey && isTextField(e.target)) return;
        if (!writable) return;
        e.preventDefault();
        if (editing) leaveEdit();
        else setEditing(true);
        return;
      }
      // Esc сначала предлагают редактору: пока открыт блок помощника, он значит «закрой
      // помощника», и только потом — «выйди из правки».
      if (e.key === 'Escape' && editing) {
        if (editorRef.current?.consumeEscape()) return;
        leaveEdit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canSave, confirmOverwrite, confirmRestore, editing, leaveEdit, save, saving, writable]);

  useEffect(() => {
    if (editing) editorRef.current?.focus(caretRef.current);
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
                  : <FailureText e={e} fallback='заметка не открылась' />}
            </Text>
            <div className='flex gap-1.5'>
              <Button size='sm' variant='secondary' onClick={() => contentQuery.refetch()}>
                повторить
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
              {contentDirty && ' в поле уже набрано другое — восстановление сначала спросит.'}
            </Text>
            <div className='ml-auto flex gap-1.5'>
              <Button
                size='xs'
                variant='secondary'
                onClick={() => (contentDirty ? setConfirmRestore(true) : restoreDraft())}
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

      {/* Имя поменял кто-то другой, а своё уже правили. Молчать нельзя дважды: человек не увидел
          бы нового имени вообще, а его сохранение вернуло бы старое — без всякого конфликта,
          потому что имя едет обычным UpdateLibraryFile, без сравнения отпечатков. */}
      {renamedElsewhere && renamedElsewhere !== name.trim() && (
        <CalloutBox tone='warning'>
          <div className='flex flex-wrap items-baseline gap-2'>
            <Text size='micro' component='span'>
              <b>файл переименовали, пока вы правили имя.</b> сейчас он называется «
              {renamedElsewhere}», в вашем поле — «{name}». сохранение поставит ваше: у имени нет
              сравнения версий, как у текста.
            </Text>
            <div className='ml-auto flex gap-1.5'>
              <Button
                size='xs'
                variant='secondary'
                onClick={() => {
                  setName(renamedElsewhere);
                  setRenamedElsewhere('');
                }}
              >
                взять новое имя
              </Button>
              <Button size='xs' variant='secondary' onClick={() => setRenamedElsewhere('')}>
                оставить своё
              </Button>
            </div>
          </div>
        </CalloutBox>
      )}

      {/* Карточка файла не прочиталась. Текст при этом виден и правится — но сохранять некуда:
          запись идёт по номеру файла. Кнопка уже погашена (`canSave`), а это — объяснение. */}
      {!file && !fileQuery.isLoading && (
        <CalloutBox tone='error' className='bg-bgColor'>
          <div className='flex flex-wrap items-baseline gap-2'>
            <Text size='micro' component='span'>
              <b>карточка файла не прочиталась — сохранить не выйдет.</b> текст цел, он на экране и
              в черновике браузера; сохранение вернётся, как только карточка прочитается.
            </Text>
            <Button
              size='xs'
              variant='secondary'
              className='ml-auto'
              onClick={() => fileQuery.refetch()}
            >
              перечитать карточку
            </Button>
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
          onLeaveEdit={leaveEdit}
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

      <ConfirmationModal
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        onConfirm={restoreDraft}
        title='восстановить черновик'
        confirmLabel='заменить набранное'
        cancelLabel='оставить набранное'
        width='sm'
      >
        <Text>
          в поле уже набрано то, чего в черновике нет. восстановление заменит набранное целиком, и
          вернуть его будет неоткуда: ⌘z сюда не достаёт, а в браузерном черновике с первой же
          набранной буквы лежит уже новый текст.
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
 *
 * ── ГАШЕНИЕ БРОСКА ЖИВЁТ ЗДЕСЬ ──────────────────────────────────────────────────────────────
 *
 * Экран заметки был ЕДИНСТВЕННЫМ в разделе без приёмника броска. Замерено: на `/files` бросок
 * погашен, на `/files/{id}/note` — нет, и браузер уходил по адресу брошенного файла прямо со
 * страницы с набранным, но не сохранённым текстом. Референс в заметку тянут ежедневно — это
 * обычный жест, а не редкий.
 *
 * В ОБОЛОЧКЕ, А НЕ В ГЛАВНОЙ ВЕТКЕ РЕНДЕРА: у экрана четыре ранних выхода (нет номера, читаем,
 * заметка не открылась), и приёмник, стоящий только в пятой ветке, защищал бы не все состояния
 * одного и того же адреса.
 *
 * ПРИНИМАТЬ ФАЙЛЫ ЭКРАН НЕ СТАЛ, и это выбор, а не упущение. Полоса отправки живёт на холсте и
 * на витрине, здесь её нет: принятая пачка ехала бы невидимо — ни хода, ни отмены, ни причины
 * отказа. Наследовать темы тоже не от чего (чипов холста здесь нет). Поэтому бросок гасится и
 * объясняется словами, а законный путь назван там же: файл кладут в библиотеку и вставляют в
 * заметку кнопкой «файл» над полем — она вставляет НОМЕР файла, который живёт столько же,
 * сколько сама заметка, в отличие от подписанного адреса.
 *
 * Перетаскивание простого ТЕКСТА в поле остаётся браузерным: предикат `upload/drop.ts`
 * пропускает ровно этот случай, и в заметке он нужен чаще, чем где-либо ещё в разделе.
 */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-gutter pb-gutter'>
      {children}
      <FilesDropOverlay
        enabled={false}
        disabledNote='заметка файлов не принимает — положите файл в библиотеку и вставьте его в текст кнопкой «файл»'
        topicLabels={[]}
        onFiles={() => {}}
      />
    </div>
  );
}

export default NotePage;
