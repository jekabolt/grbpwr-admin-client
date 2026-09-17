import { useMemo, useState } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { failureText } from '../api/rpc-error';
import { useFilesMutations, useFileTopics, useLibraryFiles } from '../hooks/useFiles';
import { plural } from '../upload/text';
import { formatBytes } from '../utils/format';

/**
 * «ПОЛОЖИТЬ В ПРОЕКТ ТО, ЧТО УЖЕ ЕСТЬ В БИБЛИОТЕКЕ».
 *
 * Просьба владельца дословно: «внутри проекта первым блоком всегда должен быть плейсхолдер для
 * добавления нового файла в проект, нажимаешь на него и должна быть модалка, в которой можно
 * выбрать из текущих мультиселектом».
 *
 * ФАЙЛ СЮДА НЕ ЗАГРУЖАЕТСЯ И НЕ КОПИРУЕТСЯ. Проект — это тема, а тема — ярлык: «добавить в
 * проект» значит завести связь «файл ↔ проект». Один и тот же файл законно лежит в двух
 * проектах, и снятие его отсюда не удаляет ничего из библиотеки.
 *
 * ЗАПИСЬ — ТА ЖЕ, ЧТО У ПОЛОСЫ ВЫДЕЛЕНИЯ, и выбирается тем же правилом: без роли связь заводит
 * `AssignTopics`, с ролью — `SetFileRoles` (он же и заводит саму связь). Второй способ класть
 * файл в проект в разделе не появляется.
 *
 * УЖЕ ЛЕЖАЩИЕ В ПРОЕКТЕ ПОКАЗАНЫ И НЕ ВЫБИРАЮТСЯ. Спрятать их значило бы отвечать «такого файла
 * нет» человеку, который ищет именно его; дать выбрать — обещать действие, которое ничего не
 * меняет. Поэтому они на месте, названы словом и не нажимаются.
 */
export function AddFilesToProjectModal({
  projectId,
  projectName,
  roleId,
  roleName,
  onClose,
}: {
  projectId: number;
  projectName: string;
  /** Роль, которую получат добавленные файлы. 0 — без роли (они лягут в кучу «without a role»). */
  roleId: number;
  roleName?: string;
  onClose: () => void;
}) {
  const { assignTopics, setRoles } = useFilesMutations();
  const { showMessage } = useSnackBarStore();
  const [search, setSearch] = useState('');
  const [topicId, setTopicId] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const topicsQuery = useFileTopics();
  const filesQuery = useLibraryFiles({
    topicIds: topicId ? [topicId] : [],
    untopiced: false,
    search,
    sort: 'new',
  });

  const files = useMemo(
    () => (filesQuery.data?.pages ?? []).flatMap((p) => p.files ?? []),
    [filesQuery.data],
  );
  // Проекты в этот ряд не идут: ряд сужает выбор ЯРЛЫКОМ, а сужение проектом здесь значило бы
  // «покажи файлы другого проекта» — вопрос, которого у этого диалога нет.
  const topics = (topicsQuery.data?.topics ?? []).filter((t) => (t.kind ?? '') !== 'project');

  const inProject = (f: LibraryFile) => (f.topics ?? []).some((t) => Number(t.id) === projectId);

  const submit = async () => {
    if (!picked.length) return;
    setSaving(true);
    try {
      if (roleId > 0) {
        await setRoles.mutateAsync({ fileIds: picked, projectTopicId: projectId, roleId });
      } else {
        await assignTopics.mutateAsync({ fileIds: picked, topicIds: [projectId], newTopics: [] });
      }
      showMessage(
        `${picked.length} ${plural(picked.length, 'file')} → “${projectName}”${
          roleId > 0 && roleName ? ` as “${roleName}”` : ''
        }`,
        'success',
      );
      onClose();
    } catch (e) {
      // Диалог ОСТАЁТСЯ открытым с тем же выбором: собирать пачку заново из-за отказа сервера —
      // это наказание за чужую ошибку.
      showMessage(failureText(e, "couldn't add the files to the project"), 'error');
      setSaving(false);
    }
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => !o && onClose()}
      onConfirm={submit}
      title={`add to “${projectName}”${roleId > 0 && roleName ? ` · ${roleName}` : ''}`}
      confirmLabel={
        saving ? 'adding…' : picked.length ? `add ${picked.length}` : 'nothing picked yet'
      }
      confirmDisabled={saving || !picked.length}
      closeOnConfirm={false}
      width='lg'
    >
      <div className='flex flex-col gap-2.5'>
        <Text size='micro' variant='label'>
          {roleId > 0 && roleName
            ? `the picked files get a link to the project with the role “${roleName}”. nothing is uploaded and nothing is copied: a file lies in the library once and can belong to several projects.`
            : 'the picked files get a link to the project, with no role — they show up in the “without a role” pile. nothing is uploaded and nothing is copied: a file lies in the library once and can belong to several projects.'}
        </Text>

        <Input
          name='addToProjectSearch'
          value={search}
          placeholder='file name or topic'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />

        {topics.length > 0 && (
          <ChipRow>
            <Chip selected={topicId === 0} pressed={topicId === 0} onClick={() => setTopicId(0)}>
              all
            </Chip>
            {topics.map((t) => (
              <Chip
                key={t.id}
                selected={topicId === Number(t.id)}
                pressed={topicId === Number(t.id)}
                onClick={() => setTopicId(Number(t.id))}
              >
                {t.name}
              </Chip>
            ))}
          </ChipRow>
        )}

        {filesQuery.isLoading ? (
          <Text size='micro' variant='label'>
            loading…
          </Text>
        ) : files.length === 0 ? (
          <Text size='micro' variant='label'>
            {search ? 'nothing found' : 'the library has no files yet'}
          </Text>
        ) : (
          <div className='max-h-[50vh] overflow-y-auto'>
            <Tiles min={120}>
              {files.map((f) => {
                const id = Number(f.id);
                const here = inProject(f);
                const on = picked.includes(id);
                return (
                  <Tile
                    key={id}
                    title={
                      here ? `${f.fileName ?? ''} — already in this project` : f.fileName ?? ''
                    }
                    name={f.fileName ?? ''}
                    // «УЖЕ ЗДЕСЬ» — СЛОВОМ, а не только серостью: цвет на плитке уже занят
                    // выбором, и два смысла одним признаком не различить.
                    sub={here ? 'already here' : formatBytes(Number(f.sizeBytes ?? 0))}
                    selected={on}
                    pressed={here ? undefined : on}
                    onClick={
                      here
                        ? undefined
                        : () =>
                            setPicked((p) =>
                              p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
                            )
                    }
                    media={
                      f.previewUrl ? (
                        <img
                          src={f.previewUrl}
                          alt=''
                          loading='lazy'
                          className='aspect-square w-full bg-bgSecondary object-contain'
                        />
                      ) : (
                        <div className='flex aspect-square w-full items-center justify-center bg-bgSecondary'>
                          <Text size='micro' variant='label' className='uppercase'>
                            {(f.fileName ?? '').split('.').pop()?.slice(0, 4) || 'file'}
                          </Text>
                        </div>
                      )
                    }
                  />
                );
              })}
            </Tiles>
          </div>
        )}

        {filesQuery.hasNextPage && (
          <button
            type='button'
            disabled={filesQuery.isFetchingNextPage}
            onClick={() => filesQuery.fetchNextPage()}
            className='self-start text-micro uppercase tracking-label text-labelColor underline hover:text-textColor disabled:opacity-50'
          >
            {filesQuery.isFetchingNextPage ? 'loading…' : 'show more'}
          </button>
        )}
      </div>
    </ConfirmationModal>
  );
}
