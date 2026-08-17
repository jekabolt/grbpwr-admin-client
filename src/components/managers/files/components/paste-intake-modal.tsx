import { useEffect, useState } from 'react';
import type { FileTopic } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { inheritTopics, type BatchTopics } from '../upload/queue';
import { formatBytes } from '../utils/format';

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

/** «вставка 17.08 13:40.png» — дата с временем, потому что вставок за день бывает много. */
function pastedName(file: File, index: number): string {
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
  return `вставка ${stamp}${suffix}.${ext}`;
}

function renameFile(file: File, name: string): File {
  const next = name.trim();
  if (!next || next === file.name) return file;
  return new File([file], next, { type: file.type, lastModified: file.lastModified });
}

export function PasteIntakeModal({
  files,
  topics,
  presetTopicIds,
  onCancel,
  onSubmit,
}: {
  /** Что уже вставили. Повторный ⌘V ДОПИСЫВАЕТ сюда — модалка при этом не переоткрывается. */
  files: File[];
  topics: FileTopic[];
  /** Выбранные чипы холста: та же наследственность, что у броска и у кнопки «загрузить». */
  presetTopicIds: number[];
  onCancel: () => void;
  onSubmit: (files: File[], topics: BatchTopics) => void;
}) {
  const [names, setNames] = useState<string[]>([]);
  const [dims, setDims] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<number[]>(presetTopicIds);
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

  const inheritedNames = presetTopicIds
    .map((id) => topics.find((t) => Number(t.id) === id)?.name)
    .filter(Boolean) as string[];

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
      title={files.length > 1 ? `вставка из буфера · ${files.length}` : 'вставка из буфера'}
      confirmLabel='загрузить'
      cancelLabel='отмена'
      confirmDisabled={!ready}
      closeOnConfirm={false}
      width='lg'
    >
      <div className='flex flex-col gap-2.5'>
        <CalloutBox tone='warning'>
          <Text size='micro' component='p'>
            превью уже построено браузером, отправки ещё не было. закроете — ничего не уедет.
          </Text>
        </CalloutBox>

        {files.map((file, i) => (
          <div key={`${file.name}-${file.size}-${i}`} className='flex items-start gap-2.5'>
            <div className='w-[180px] flex-none border border-borderColor bg-bgSecondary'>
              <img
                src={urls[i]}
                alt=''
                onLoad={(e) =>
                  setDims((d) => ({
                    ...d,
                    [i]: `${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`,
                  }))
                }
                className='aspect-square w-full object-contain'
              />
            </div>
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <Text size='micro' variant='label' component='p'>
                {[dims[i], file.type || 'тип неизвестен', formatBytes(file.size)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
                имя
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
                у картинки из буфера имени нет — если не дать своё, в библиотеке появится
                очередной «image.png», который потом не найдёт никакой поиск
              </Text>
            </div>
          </div>
        ))}

        {noExtension && (
          <Text size='micro' variant='label' component='p'>
            в имени нет расширения — так тоже можно, но по имени файл потом не узнают, чем его
            открывать
          </Text>
        )}

        <div className='flex flex-col gap-1 border-t border-hairline pt-2'>
          <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
            темы
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
                  title={presetTopicIds.includes(id) ? 'унаследована с холста' : undefined}
                  onClick={() =>
                    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
                  }
                >
                  {t.name}
                  {presetTopicIds.includes(id) && (
                    <span className='opacity-70'>открытая</span>
                  )}
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
              placeholder='новая тема'
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
              + новая
            </Button>
          </div>
          <Text size='micro' variant='label' component='p'>
            {selected.length || pendingNew.length
              ? `встанут на вставку: ${[
                  ...selected
                    .map((id) => topics.find((t) => Number(t.id) === id)?.name)
                    .filter(Boolean),
                  ...pendingNew,
                ].join(', ')}`
              : inheritedNames.length
                ? 'темы сняты — вставка уедет в «разобрать»'
                : 'тем нет — вставка уедет в «разобрать». это нормальный ход, разобрать можно позже'}
          </Text>
        </div>

        <Text size='micro' variant='label' component='p'>
          ⌘V ещё раз — добавит вторую картинку в ту же очередь
        </Text>
      </div>
    </ConfirmationModal>
  );
}
