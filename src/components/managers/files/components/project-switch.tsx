import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Button, Drawer, SideRailItem, Text } from 'ui';
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
 * ЗАГОЛОВОК СТРАНИЦЫ = ПРОЕКТ. На телефоне это кнопка «all files ▾», которая открывает нижний
 * лист со списком проектов и «+ new project»; на десктопе — просто заголовок: переключатель там
 * стоит в рейле слева.
 *
 * ЗАВЕДЕНИЕ ПРОЕКТА — ТАМ, ГДЕ ПРОЕКТ ВЫБИРАЮТ: «ещё никакой, заведи новый» — ответ на тот же
 * вопрос. Сам диалог живёт у страницы, а не здесь: лист закрывается, а диалог должен остаться.
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
    <>
      <Button
        aria-haspopup='dialog'
        className='flex min-w-0 items-center gap-1.5 self-start text-left lg:hidden'
        onClick={() => setOpen(true)}
      >
        <Text component='span' size='large' className='truncate font-bold'>
          {name}
        </Text>
        <Text component='span' size='control' variant='label' aria-hidden>
          ▾
        </Text>
      </Button>
      <Text
        component='h1'
        size='large'
        className='hidden max-w-xs shrink-0 truncate font-bold lg:block'
      >
        {name}
      </Text>
      <Drawer side='bottom' open={open} onOpenChange={setOpen} title='project'>
        <div className='flex flex-col gap-3'>
          <ProjectList
            projects={projects}
            activeProject={activeProject}
            projectId={projectId}
            totalFiles={totalFiles}
            itemClassName='py-2.5 text-textBaseSize'
            onPick={(id) => {
              setOpen(false);
              onPick(id);
            }}
          />
          <Button
            variant='secondary'
            className='h-10 w-full'
            disabled={!writable}
            onClick={() => {
              setOpen(false);
              onNew();
            }}
          >
            + new project
          </Button>
          <Button asChild variant='underline' className='self-start text-labelColor'>
            <Link to={ROUTES.filesProjects}>all projects</Link>
          </Button>
        </div>
      </Drawer>
    </>
  );
}
