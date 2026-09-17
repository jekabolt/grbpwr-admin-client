import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackBarStore } from 'lib/stores/store';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { failureText } from '../api/rpc-error';
import { topicsService } from '../api/topicsService';
import { invalidateFileViews } from '../hooks/useFiles';

/** День в ISO — то, что отдаёт `input type=date`. Проверяется, чтобы не сравнивать мусор. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ЗАВЕДЕНИЕ ПРОЕКТА — ОДИН ДИАЛОГ, А НЕ ТРИ ЭКРАНА.
 *
 * До этого проект заводился кружным путём: экран тем → создать тему → «kind and dates» →
 * переключатель. Три экрана и знание о том, что внутри проект это повышенная тема, — заказчик
 * об этот путь споткнулся, и правильно: он обязан думать «завожу съёмку», а не «завожу ярлык и
 * повышаю его».
 *
 * МОДЕЛЬ ПРИ ЭТОМ НЕ ОБХОДИТСЯ. Проект и есть тема с типом; здесь просто делаются оба вызова
 * подряд, ровно те же, что делал человек руками. Затравку ролей сервер сеет сам на повышении.
 *
 * КОМПОНЕНТ ЖИВЁТ НА УРОВНЕ МОДУЛЯ, а не внутри экрана: вложенное объявление получает новую
 * личность на каждую отрисовку родителя, и React размонтировал бы диалог вместе с набранным
 * именем от любого чужого обновления — поиска, ответа запроса, инвалидации.
 */
export function NewProjectModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (id: number) => void;
}) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [saving, setSaving] = useState(false);

  const create = useMutation({
    mutationFn: (a: { name: string; description: string }) =>
      topicsService.create(a.name, a.description),
  });
  const promote = useMutation({
    mutationFn: (a: { topicId: number; startsAt: string; endsAt: string }) =>
      topicsService.updateMeta({
        topicId: a.topicId,
        kind: 'project',
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        archived: false,
      }),
  });

  const datesReversed = ISO_DAY.test(from) && ISO_DAY.test(to) && to < from;

  /**
   * ДВА ВЫЗОВА ЗА ОДНО НАЖАТИЕ, И ВТОРОЙ — ЭТО И ЕСТЬ «СТАТЬ ПРОЕКТОМ».
   *
   * Модель не обходится: проект это тема, которой дали тип, и `UpdateFileTopicMeta` — тот же
   * самый вызов, который делает человек, идущий длинным путём (экран тем → «kind and dates» →
   * переключатель). Здесь просто нет двух экранов между намерением и результатом. Сервер на
   * повышении сам сеет стартовый набор ролей — та же затравка, что и на длинном пути.
   *
   * ПОЛУОТКАЗ НАЗЫВАЕТСЯ ПОЛУОТКАЗОМ. Упади второй вызов — тема уже создана, и молчать об
   * этом нельзя: повторное нажатие завело бы ВТОРУЮ тему с тем же именем и получило бы отказ
   * по уникальности, то есть человек прочёл бы «имя занято» про имя, которое сам только что
   * и занял. Поэтому здесь называется и что легло, и где доделать.
   */
  const submit = async () => {
    const nm = name.trim();
    if (!nm || datesReversed) return;
    setSaving(true);
    let id = 0;
    try {
      const res = await create.mutateAsync({ name: nm, description: description.trim() });
      id = Number(res.id ?? 0);
      if (!id) throw new Error('the server did not return the id of the new topic');
      await promote.mutateAsync({ topicId: id, startsAt: from.trim(), endsAt: to.trim() });
      invalidateFileViews(qc);
      showMessage(`the project “${nm}” is started`, 'success');
      onClose();
      onDone(id);
    } catch (e) {
      invalidateFileViews(qc);
      showMessage(
        id
          ? `${failureText(e, "couldn't give it the kind")} — the topic “${nm}” is created but is still an ordinary label: give it the kind on the topics screen`
          : failureText(e, "couldn't start the project"),
        'error',
      );
      setSaving(false);
    }
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => !o && onClose()}
      onConfirm={submit}
      title='new project'
      confirmLabel={saving ? 'starting…' : 'start the project'}
      confirmDisabled={saving || !name.trim() || datesReversed}
      closeOnConfirm={false}
      width='md'
    >
      <div className='flex flex-col gap-2'>
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            name
          </Text>
          <Input
            name='newProjectName'
            value={name}
            placeholder='for example autumn shoot'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            description
          </Text>
          <textarea
            rows={5}
            value={description}
            aria-label='project description'
            placeholder='what is being shot, for whom, and what lands in here'
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            className='w-full border border-borderColor bg-bgColor px-2 py-1.5 text-micro'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            dates
          </Text>
          <div className='flex flex-wrap items-end gap-2'>
            <Input
              name='newProjectFrom'
              type='date'
              value={from}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)}
              className='w-[160px]'
            />
            <Input
              name='newProjectTo'
              type='date'
              value={to}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)}
              className='w-[160px]'
            />
          </div>
          {datesReversed && (
            <Text size='micro' variant='error'>
              the end is earlier than the start
            </Text>
          )}
          <Text size='micro' variant='label'>
            leave them empty if this is not an event: a clo backup has no dates at all, and that is
            a state, not an unfilled field.
          </Text>
        </div>
        <Text size='micro' variant='label'>
          a project IS a topic — one that has dates, an archive and roles on the files inside it.
          starting it here does both halves in one press: the topic is created and given the kind.
          if this name already exists as an ordinary label, the server refuses it — give that one
          the kind on the topics screen instead of making a second one.
        </Text>
      </div>
    </ConfirmationModal>
  );
}
