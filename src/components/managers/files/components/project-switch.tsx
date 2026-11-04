import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Button, GenericPopover, SideRailItem, Text } from 'ui';
import { ARCHIVED_WORD, projectDates } from './topic-chips';

/**
 * ПРОЕКТ — КОНТЕКСТ СТРАНИЦЫ, А НЕ ВТОРОЙ РЯД ФИЛЬТРОВ.
 *
 * Выбор одиночный: одно значение в адресе и картинка «я работаю в одном проекте». Повторное
 * нажатие на выбранный проект возвращает ко всей библиотеке — ряд одиночного выбора без этого
 * был бы ловушкой.
 *
 * АРХИВНЫЙ ПРОЕКТ ИЗ АДРЕСА В СПИСКЕ ЕСТЬ. Холст просит словарь без архива, но прямая ссылка на
 * закрытую съёмку живёт и фильтрует; не найдись он в списке — ни одна строка не горела бы, и
 * экран спорил бы сам с собой. Номер «#id» — когда проекта нет и в архиве (старая ссылка).
 */
export function ProjectList({
  projects,
  activeProject,
  projectId,
  totalFiles,
  onPick,
  itemClassName,
}: {
  projects: FileTopic[];
  activeProject?: FileTopic;
  projectId: number;
  totalFiles: number;
  onPick: (projectId: number) => void;
  itemClassName?: string;
}) {
  const listed = projects.some((p) => Number(p.id) === projectId);
  const extra = projectId > 0 && !listed;
  return (
    <div className='flex flex-col'>
      <SideRailItem
        label='all files'
        count={totalFiles}
        selected={projectId === 0}
        onClick={() => onPick(0)}
        className={itemClassName}
      />
      {projects.map((p) => {
        const id = Number(p.id);
        const on = id === projectId;
        return (
          <div key={id} title={[p.name, projectDates(p)].filter(Boolean).join(' · ')}>
            <SideRailItem
              label={p.name ?? `#${id}`}
              count={Number(p.filesCount ?? 0)}
              selected={on}
              onClick={() => onPick(on ? 0 : id)}
              className={itemClassName}
            />
          </div>
        );
      })}
      {extra && (
        <SideRailItem
          label={
            activeProject
              ? `${activeProject.name ?? `#${projectId}`}${activeProject.archived ? ` · ${ARCHIVED_WORD}` : ''}`
              : `#${projectId}`
          }
          count={activeProject ? Number(activeProject.filesCount ?? 0) : undefined}
          selected
          onClick={() => onPick(0)}
          className={itemClassName}
        />
      )}
    </div>
  );
}

/**
 * ЗАГОЛОВОК СТРАНИЦЫ = ПРОЕКТ. На любой ширине это кнопка «all files ▾», которая открывает
 * один и тот же список проектов со счётчиками.
 *
 * ЗАВЕДЕНИЕ ПРОЕКТА — ТАМ, ГДЕ ПРОЕКТ ВЫБИРАЮТ. Сам диалог живёт у страницы, а не здесь:
 * поповер закрывается, а диалог должен остаться.
 */
export function ProjectSwitch({
  projects,
  activeProject,
  projectId,
  totalFiles,
  writable,
  onPick,
  onNew,
}: {
  projects: FileTopic[];
  activeProject?: FileTopic;
  projectId: number;
  totalFiles: number;
  writable: boolean;
  onPick: (projectId: number) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = projectId > 0 ? activeProject?.name ?? `#${projectId}` : 'all files';
  return (
    <Text component='h1' size='large' className='min-w-0 flex-1 font-bold'>
      <GenericPopover
        open={open}
        onOpenChange={setOpen}
        title='project'
        noTail
        triggerProps={{ asChild: true }}
        openElement={
          <Button className='flex max-w-full min-w-0 items-center gap-1.5 text-left text-lg font-bold lg:max-w-xs'>
            <span className='truncate'>{name}</span>
            <Text component='span' size='control' variant='label' aria-hidden>
              ▾
            </Text>
          </Button>
        }
      >
        <div className='flex flex-col'>
          <ProjectList
            projects={projects}
            activeProject={activeProject}
            projectId={projectId}
            totalFiles={totalFiles}
            itemClassName='py-1.5 text-textBaseSize'
            onPick={(id) => {
              setOpen(false);
              onPick(id);
            }}
          />
          <div className='mt-1.5 flex items-center gap-3 border-t border-hairline pt-1.5'>
            <Button
              variant='underline'
              className='text-labelColor'
              disabled={!writable}
              onClick={() => {
                setOpen(false);
                onNew();
              }}
            >
              + project
            </Button>
            <Button asChild variant='underline' className='text-labelColor'>
              <Link to={ROUTES.filesProjects}>all</Link>
            </Button>
            <Button asChild variant='underline' className='ml-auto text-labelColor'>
              <Link to={ROUTES.filesShared}>shared</Link>
            </Button>
          </div>
        </div>
      </GenericPopover>
    </Text>
  );
}
