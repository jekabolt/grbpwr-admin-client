import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { notePath } from 'constants/routes';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackBarStore } from 'lib/stores/store';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { noteErrorText, notesService } from '../api/notesService';
import { filesKeys } from '../hooks/useFiles';

/**
 * Создание заметки: ИМЯ СПРАШИВАЕТСЯ СРАЗУ.
 *
 * Заметка без имени — это `заметка (3).md` в списке из сорока таких же, и найти её потом
 * нечем: поиск раздела идёт по имени, темам и людям, но не по содержимому. Пустое имя тут
 * стоило бы дешёвого клика сейчас и получаса поиска через неделю, поэтому кнопка мертва,
 * пока поле пусто, а не подставляет умолчание.
 *
 * Заметка создаётся ПУСТОЙ и сразу открывается на правку: экран заметки — единственное
 * место, где её содержимое вообще набирают, и заводить второе поле ввода здесь значило бы
 * иметь два редактора одного текста.
 */
export function NewNoteModal({
  topics,
  onClose,
}: {
  topics: FileTopic[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  // НАБРАННОЕ, НО НЕ ЗАЭНТЕРЕННОЕ ИМЯ ТЕМЫ — ТОЖЕ ВЫБОР. То же правило, что в карточке файла:
  // заполненное поле рядом с кнопкой, которая его не учитывает, — тупик.
  const pendingTopics = useMemo(() => {
    const typed = newTopic.trim();
    if (!typed || newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())) return newTopics;
    return [...newTopics, typed];
  }, [newTopic, newTopics]);

  const create = async () => {
    setFailure(undefined);
    setSaving(true);
    try {
      const res = await notesService.createNote({
        // Расширение дописывает СЕРВЕР. Дописав `.md` здесь, клиент получил бы `план.md.md`
        // у того, кто ввёл имя с расширением сам.
        fileName: name.trim(),
        topicIds: selected,
        newTopics: pendingTopics,
        content: '',
      });
      const id = res.file?.id;
      qc.invalidateQueries({ queryKey: filesKeys.all });
      if (id) {
        navigate(notePath(id));
        return;
      }
      // Создалась, но id не приехал: закрывать молча нельзя — человек решит, что не вышло, и
      // нажмёт второй раз, получив вторую заметку с тем же именем.
      showMessage('заметка создана, но открыть её не вышло — найдите её в библиотеке', 'success');
      onClose();
    } catch (e) {
      setFailure(noteErrorText(e, 'не удалось создать заметку'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => {
        if (!o && !saving) onClose();
      }}
      onConfirm={create}
      closeOnConfirm={false}
      title='новая заметка'
      confirmLabel={saving ? 'создаём…' : 'создать и открыть'}
      confirmDisabled={!name.trim() || saving}
      cancelLabel='отмена'
      width='sm'
    >
      <div className='flex flex-col gap-2.5'>
        <div className='flex flex-col gap-1'>
          <GroupLabel>имя</GroupLabel>
          <Input
            name='noteName'
            value={name}
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder='например: бриф на съёмку'
          />
          <Text size='micro' variant='label'>
            расширение .md дописывается само — искать заметку потом будут по этому имени
          </Text>
        </div>

        <div className='flex flex-col gap-1'>
          <GroupLabel>темы</GroupLabel>
          <ChipRow>
            {topics.map((t) => (
              <Chip
                key={t.id}
                selected={selected.includes(Number(t.id))}
                pressed={selected.includes(Number(t.id))}
                onClick={() =>
                  setSelected((p) =>
                    p.includes(Number(t.id))
                      ? p.filter((x) => x !== Number(t.id))
                      : [...p, Number(t.id)],
                  )
                }
              >
                {t.name}
              </Chip>
            ))}
            {newTopics.map((n) => (
              <Chip key={n} selected onRemove={() => setNewTopics((p) => p.filter((x) => x !== n))}>
                {n}
              </Chip>
            ))}
            {!topics.length && !newTopics.length && (
              <Text size='micro' variant='label' component='span'>
                тем пока нет
              </Text>
            )}
          </ChipRow>
          <Input
            name='newNoteTopic'
            value={newTopic}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTopic(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const typed = newTopic.trim();
              if (!typed) return;
              if (!newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())) {
                setNewTopics((p) => [...p, typed]);
              }
              setNewTopic('');
            }}
            placeholder='новая тема — enter'
          />
        </div>

        {failure && (
          // ОТКАЗ ОСТАЁТСЯ НА ЭКРАНЕ, а не улетает тостом: он называет причину (слишком
          // длинное имя, нет права), и человек правит поле, глядя на неё. Рамка `error`, а не
          // красный текст: красный в этой админке означает убыток, и цвет здесь несёт рамка.
          <div className='border border-error px-2.5 py-2'>
            <Text size='micro'>{failure}</Text>
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
