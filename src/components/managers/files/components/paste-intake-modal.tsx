import { useEffect, useState } from 'react';
import type { FileTopic } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { inheritTopics, type BatchTopics } from '../upload/queue';
import { extensionOf, formatBytes, kindWord } from '../utils/format';
import { ProjectArchiveMark, projectHint } from './topic-chips';

/**
 * ПРИЁМНАЯ МОДАЛКА ⌘V.
 *
 * Главная её работа — ИМЯ. У картинки из буфера имени нет вообще: браузер отдаёт `image.png`
 * всем подряд, и библиотека набивается двумя десятками одинаковых «image.png», которые потом
 * не находит никакой поиск — а поиск здесь ищет по имени, теме и человеку, но не по
 * содержимому. Поэтому вставка не уезжает молча: сначала показать, что в буфере, и спросить,
 * как это назвать.
 *
 * Очередь берёт имя БУКВАЛЬНО (`upload/queue.ts`), никакого причёсывания за спиной нет — то,
 * что стоит в поле, и ляжет в библиотеку. Переименование делается заменой самого `File`, а не
 * отдельным полем: так имя едет тем же путём, что и у файла из проводника.
 *
 * `MediaSlot` / `useMediaIntake` не переиспользуются намеренно: они типизированы под
 * `common_MediaFull` и публичный медиа-бакет, а библиотека приватная и хранит что угодно.
 */

/**
 * Имена, которыми браузер зовёт БЕЗЫМЯННОЕ. Скриншот из буфера приходит как «image.png» у
 * всех подряд — вот у него имени и нет. У файла, скопированного из проводника, имя своё, и
 * подменять его выдуманным нельзя: человек ищет файл по тому имени, под которым он его знает.
 */
const NAMELESS = /^(image|unknown|blob)\.(png|jpe?g|webp|gif|avif|tiff?|bmp)$/i;

/** «paste 17.08 13-40.png» — дата с временем, потому что вставок за день бывает много. */
function pastedName(file: File, index: number): string {
  const own = (file.name ?? '').trim();
  if (own && !NAMELESS.test(own)) return own;
  const now = new Date();
  const stamp = now
    .toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    // ru-RU отдаёт «17.08, 13:40». Запятая в имени файла ни к чему, а двоеточие — прямой вред:
    // в macOS оно незаконно, и скачанный файл лёг бы на диск под другим именем, чем в
    // библиотеке. Расхождение имён — ровно то, из-за чего файл потом не находят.
    .replace(',', '')
    .replace(':', '-');
  const ext = (() => {
    const fromName = file.name.includes('.') ? file.name.split('.').pop() : '';
    if (fromName && fromName.length <= 5) return fromName.toLowerCase();
    const sub = (file.type || '').split('/')[1] ?? '';
    return sub === 'jpeg' ? 'jpg' : sub || 'png';
  })();
  // Две картинки, вставленные в одну минуту, иначе получили бы одно имя на двоих.
  const suffix = index > 0 ? ` (${index + 1})` : '';
  return `paste ${stamp}${suffix}.${ext}`;
}

function renameFile(file: File, name: string): File {
  const next = name.trim();
  if (!next || next === file.name) return file;
  return new File([file], next, { type: file.type, lastModified: file.lastModified });
}

export function PasteIntakeModal({
  files,
  topics,
  projects,
  presetTopicIds,
  presetProjectId,
  onCancel,
  onSubmit,
}: {
  /** Что уже вставили. Повторный ⌘V ДОПИСЫВАЕТ сюда — модалка при этом не переоткрывается. */
  files: File[];
  /** Только обычные темы: проекты приезжают отдельно и рисуются своей группой. */
  topics: FileTopic[];
  projects: FileTopic[];
  /** Выбранные чипы холста: та же наследственность, что у броска и у кнопки «загрузить». */
  presetTopicIds: number[];
  /**
   * Активный проект холста. Наследуется НАРАВНЕ с темами: проект — это тема, и вставка внутри
   * съёмки, уехавшая в «разобрать», — ровно тот шов, из-за которого группировку и чинили.
   */
  presetProjectId: number;
  onCancel: () => void;
  onSubmit: (files: File[], topics: BatchTopics) => void;
}) {
  const preset = presetProjectId > 0 ? [...presetTopicIds, presetProjectId] : presetTopicIds;
  const [names, setNames] = useState<string[]>([]);
  const [dims, setDims] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<number[]>(preset);
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState('');

  // Имена ДОПИСЫВАЮТСЯ, а не пересобираются: вторая вставка не имеет права стереть имя,
  // которое человек уже набрал для первой.
  useEffect(() => {
    setNames((prev) =>
      prev.length >= files.length
        ? prev.slice(0, files.length)
        : [...prev, ...files.slice(prev.length).map((f, i) => pastedName(f, prev.length + i))],
    );
  }, [files]);

  // Адреса превью создаются В ЭФФЕКТЕ, а не в `useMemo`: под StrictMode react в разработке
  // прогоняет setup → cleanup → setup, и адрес, созданный при рендере, был бы отозван уборкой
  // первого прохода — картинка ломалась бы ровно в дев-сборке, где её и смотрят.
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made = files.map((f) => URL.createObjectURL(f));
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const typed = newTopic.trim();
  const pendingNew =
    typed && !newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())
      ? [...newTopics, typed]
      : newTopics;

  const nameOf = (id: number) =>
    [...topics, ...projects].find((t) => Number(t.id) === id)?.name;
  const inheritedNames = preset.map(nameOf).filter(Boolean) as string[];

  const ready = files.length > 0 && names.length === files.length && names.every((n) => n.trim());
  const noExtension = names.some((n) => n.trim() && !/\.[a-z0-9]{1,5}$/i.test(n.trim()));

  const addNewTopic = () => {
    if (!typed) return;
    if (!newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())) {
      setNewTopics((p) => [...p, typed]);
    }
    setNewTopic('');
  };

  const submit = () => {
    if (!ready) return;
    onSubmit(
      files.map((f, i) => renameFile(f, names[i])),
      inheritTopics(selected, pendingNew),
    );
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      onConfirm={submit}
      title={
        files.length > 1 ? `paste from the clipboard · ${files.length}` : 'paste from the clipboard'
      }
      confirmLabel='upload'
      cancelLabel='cancel'
      confirmDisabled={!ready}
      closeOnConfirm={false}
      width='lg'
    >
      <div className='flex flex-col gap-2.5'>
        <CalloutBox tone='warning'>
          <Text size='micro' component='p'>
            the preview is already built by the browser, there has been no upload yet. close it —
            and nothing goes anywhere.
          </Text>
        </CalloutBox>

        {files.map((file, i) => (
          <div key={`${file.name}-${file.size}-${i}`} className='flex items-start gap-2.5'>
            {/* В буфере бывает не только картинка: скопированный из проводника pdf или zip
                приходит сюда тем же ⌘V. Тянуть в `img` то, что браузер нарисовать не может,
                значит показать сломанный кадр — поэтому у остального плашка с расширением. */}
            <div className='flex aspect-square w-[180px] flex-none items-center justify-center border border-borderColor bg-bgSecondary'>
              {file.type.startsWith('image/') ? (
                <img
                  src={urls[i]}
                  alt=''
                  onLoad={(e) =>
                    setDims((d) => ({
                      ...d,
                      [i]: `${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`,
                    }))
                  }
                  className='size-full object-contain'
                />
              ) : (
                <div className='flex flex-col items-center gap-0.5'>
                  <Text component='span' className='font-bold uppercase'>
                    {extensionOf(file.name)}
                  </Text>
                  <Text size='micro' variant='label' component='span' className='uppercase'>
                    {kindWord(file.type, file.name)}
                  </Text>
                </div>
              )}
            </div>
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <Text size='micro' variant='label' component='p'>
                {[dims[i], file.type || 'type unknown', formatBytes(file.size)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text
                size='micro'
                variant='uppercase'
                tracking='group'
                component='p'
                className='font-bold'
              >
                name
              </Text>
              <Input
                name={`paste-name-${i}`}
                value={names[i] ?? ''}
                autoComplete='off'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNames((prev) => prev.map((v, k) => (k === i ? e.target.value : v)))
                }
              />
              <Text size='micro' variant='label' component='p'>
                a picture from the clipboard has no name — if you don't give it one, the library
                gets yet another “image.png” that no search will find later
              </Text>
            </div>
          </div>
        ))}

        {noExtension && (
          <Text size='micro' variant='label' component='p'>
            the name has no extension — that is allowed too, but later the name won't tell what to
            open the file with
          </Text>
        )}

        {/* ПРОЕКТЫ — СВОЯ ГРУППА. Тот же довод, что в карточке файла: чип проекта и чип темы
            выглядят одинаково, а кладут их с разной мыслью. Роли здесь нет намеренно —
            вставка попадает в проект БЕЗ роли, как и бросок: приёмная куча законна, а
            спрашивать роль в момент вставки значило бы задерживать отправку вопросом, ответ на
            который чаще всего «потом разберу». */}
        {projects.length > 0 && (
          <div className='flex flex-col gap-1 border-t border-hairline pt-2'>
            <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
              projects
            </Text>
            <ChipRow>
              {projects.map((p) => {
                const id = Number(p.id);
                const on = selected.includes(id);
                const d = projectHint(p);
                return (
                  <Chip
                    key={id}
                    selected={on}
                    pressed={on}
                    title={presetProjectId === id ? 'chosen on the canvas' : d || undefined}
                    onClick={() =>
                      setSelected((prev) =>
                        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                      )
                    }
                  >
                    {p.name}
                    <ProjectArchiveMark project={p} />
                  </Chip>
                );
              })}
            </ChipRow>
            <Text size='micro' variant='label' component='p'>
              the paste lands in the project without a role — the role is set later, by picking the
              files out in the grid
            </Text>
          </div>
        )}

        <div className='flex flex-col gap-1 border-t border-hairline pt-2'>
          <Text
            size='micro'
            variant='uppercase'
            tracking='group'
            component='p'
            className='font-bold'
          >
            topics
          </Text>
          <ChipRow>
            {topics.map((t) => {
              const id = Number(t.id);
              const on = selected.includes(id);
              return (
                <Chip
                  key={id}
                  selected={on}
                  pressed={on}
                  title={presetTopicIds.includes(id) ? 'inherited from the canvas' : undefined}
                  onClick={() =>
                    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
                  }
                >
                  {/* Здесь стояло слово «открытая» — остаток от чужого чипа, и внутри
                      «СЪЁМКА ОТКРЫТАЯ» оно не значило ничего. Что тема пришла с холста,
                      сказано подсказкой и строкой под рядом чипов. */}
                  {t.name}
                </Chip>
              );
            })}
            {newTopics.map((n) => (
              <Chip key={n} selected onRemove={() => setNewTopics((p) => p.filter((x) => x !== n))}>
                {n}
              </Chip>
            ))}
          </ChipRow>
          <div className='flex items-center gap-1.5'>
            <Input
              name='paste-new-topic'
              value={newTopic}
              placeholder='new topic'
              autoComplete='off'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTopic(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                addNewTopic();
              }}
              className='max-w-[220px]'
            />
            <Button size='xs' variant='secondary' disabled={!typed} onClick={addNewTopic}>
              + new
            </Button>
          </div>
          <Text size='micro' variant='label' component='p'>
            {selected.length || pendingNew.length
              ? `will be set on the paste: ${[...selected.map(nameOf).filter(Boolean), ...pendingNew].join(', ')}`
              : inheritedNames.length
                ? 'the topics are taken off — the paste will go to “unsorted”'
                : 'no topics — the paste will go to “unsorted”. this is a normal move, you can sort them later'}
          </Text>
        </div>

        {/* ЧЕСТНАЯ ОГОВОРКА. Вставка намеренно не перехватывается, пока курсор стоит в поле
            (иначе ⌘V в имени вставлял бы картинку вместо текста) — а эта модалка существует
            ровно затем, чтобы человек стоял в поле имени. Без оговорки обещание не работает
            именно там, где его читают. */}
        <Text size='micro' variant='label' component='p'>
          ⌘V again adds the next file to the same paste — but first take the cursor out of the
          field: in a field ⌘V puts text
        </Text>
      </div>
    </ConfirmationModal>
  );
}
