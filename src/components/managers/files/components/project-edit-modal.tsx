import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FileTopic } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { failureText } from '../api/rpc-error';
import { topicsService } from '../api/topicsService';
import { invalidateFileViews } from '../hooks/useFiles';

/**
 * День без часового пояса, как его принимает сервер. Ровно в этом виде строки сравнимы
 * лексикографически, и сравнение совпадает с хронологическим — потому проверка порядка дат и
 * обходится без разбора в `Date`. Та же константа стоит на экране тем: правило одно, а экрана
 * два, и второе прочтение регулярки здесь было бы второй копией одного правила.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ПРАВКА ПРОЕКТА С ЕГО СОБСТВЕННОЙ СТРАНИЦЫ: имя, описание, даты.
 *
 * ТИПА И АРХИВА ЗДЕСЬ НЕТ, и это решение, а не пропуск. «Перестать быть проектом» сносит роли
 * со всех файлов и отвязывает вещи и задачи — необратимо и с тремя числами последствий; архив
 * — вопрос про весь словарь тем, а не про эту страницу. Оба живут на экране тем, где стоит
 * предупреждение с посчитанными числами. Продублировать их здесь значило бы завести ВТОРОЕ
 * место, где проект понижают, — и второе место, где это предупреждение придётся держать
 * в актуальном состоянии.
 *
 * ДВА ВЫЗОВА, И ШЛЁТСЯ ТОЛЬКО ИЗМЕНЁННОЕ. Имя с описанием едут `RenameFileTopic`, даты —
 * `UpdateFileTopicMeta`, и это разные сообщения контракта. Слать оба всегда было бы дешевле в
 * коде и дороже на деле: `UpdateFileTopicMeta` замещает НАБОР целиком (тип, даты, архив), и
 * каждый лишний вызов — это лишний шанс переписать чужую правку архива, сделанную на соседнем
 * экране, теми значениями, с которыми модалку открыли.
 */
export function ProjectEditModal({
  project,
  onClose,
}: {
  project: FileTopic;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const id = Number(project.id ?? 0);

  const [name, setName] = useState(project.name ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [from, setFrom] = useState(project.startsAt ?? '');
  const [to, setTo] = useState(project.endsAt ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(project.name ?? '');
    setDescription(project.description ?? '');
    setFrom(project.startsAt ?? '');
    setTo(project.endsAt ?? '');
  }, [project.id, project.name, project.description, project.startsAt, project.endsAt]);

  const rename = useMutation({
    mutationFn: (a: { name: string; description: string }) =>
      topicsService.rename(id, a.name, a.description),
  });
  const meta = useMutation({
    mutationFn: (a: { startsAt: string; endsAt: string }) =>
      topicsService.updateMeta({
        topicId: id,
        // Тип и архив едут ТЕМИ ЖЕ, что приехали: сообщение замещает набор целиком, и опустить
        // их значило бы понизить проект до ярлыка правкой дат.
        kind: 'project',
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        archived: !!project.archived,
      }),
  });

  /**
   * КОНЕЦ РАНЬШЕ НАЧАЛА — ВИДНО У ПОЛЯ, А НЕ ОТКАЗОМ С ТОГО БЕРЕГА. Ответ на этот вопрос целиком
   * в двух полях, которые человек видит; сервер остаётся последней линией
   * (`ends_at cannot be earlier than starts_at`). Проверка включается только на двух настоящих
   * днях: в браузере без поддержки `type=date` поле вырождается в текст, и сравнение строк там
   * не значит ничего.
   */
  const datesReversed = ISO_DAY.test(from) && ISO_DAY.test(to) && to < from;

  const nameChanged = name.trim() !== (project.name ?? '');
  const descChanged = description.trim() !== (project.description ?? '');
  const datesChanged = from.trim() !== (project.startsAt ?? '') || to.trim() !== (project.endsAt ?? '');
  const dirty = nameChanged || descChanged || datesChanged;

  const save = async () => {
    if (!name.trim() || datesReversed || !dirty) return;
    setSaving(true);
    let named = false;
    try {
      if (nameChanged || descChanged) {
        await rename.mutateAsync({ name: name.trim(), description: description.trim() });
        named = true;
      }
      if (datesChanged) {
        await meta.mutateAsync({ startsAt: from.trim(), endsAt: to.trim() });
      }
      invalidateFileViews(qc);
      showMessage('saved', 'success');
      onClose();
    } catch (e) {
      // ПОЛУОТКАЗ НАЗЫВАЕТСЯ ПОЛУОТКАЗОМ. Два вызова — два исхода, и «не сохранилось» на экране,
      // где имя уже переписано, отправило бы человека нажимать второй раз ради того, что уже
      // произошло. Перечитываем в любом случае: первая половина могла лечь.
      invalidateFileViews(qc);
      showMessage(
        named
          ? `${failureText(e, "couldn't save the dates")} — the name and the description are saved, the dates are not`
          : failureText(e, "couldn't save the project"),
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => !o && onClose()}
      onConfirm={save}
      title={`project “${project.name ?? ''}”`}
      confirmLabel={saving ? 'saving…' : 'save'}
      confirmDisabled={saving || !name.trim() || datesReversed || !dirty}
      closeOnConfirm={false}
      width='md'
    >
      <div className='flex flex-col gap-2'>
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            name
          </Text>
          <Input
            name='projectName'
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          />
        </div>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            description
          </Text>
          <textarea
            rows={8}
            value={description}
            aria-label='project description'
            placeholder='what is being shot, for whom, and what lands in here'
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            className='w-full border border-borderColor bg-bgColor px-2 py-1.5 text-micro'
          />
          <Text size='micro' variant='label'>
            the same field an ordinary topic has. on a project it is the first paragraph of its
            page: what this is, who it is for, what lands in it. no length limit — a whole
            shooting brief goes in.
          </Text>
        </div>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            dates
          </Text>
          <div className='flex flex-wrap items-end gap-2'>
            <Input
              name='projectFrom'
              type='date'
              value={from}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)}
              className='w-[160px]'
            />
            <Input
              name='projectTo'
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
            empty is not “unfilled”: a clo backup is not an event and has no dates at all. days,
            not moments — “12–14 september” has no time zone, and had we given it a time we would
            have to answer whose midnight starts the day.
          </Text>
        </div>

        <Text size='micro' variant='label'>
          the kind and the archive are not here: dropping the kind zeroes the roles on every file
          of this project and unlinks the garments and the tasks that point at it — that one lives
          on the topics screen, with the numbers counted before the press.
        </Text>
      </div>
    </ConfirmationModal>
  );
}
