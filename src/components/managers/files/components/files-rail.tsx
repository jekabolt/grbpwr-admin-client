import { Link } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Button, SideRail, SideRailGroup, SideRailItem } from 'ui';
import type { PersonRoleFilter } from '../hooks/useFiles';
import { PersonFilter } from './files-toolbar';
import { ProjectList } from './project-switch';
import { MAX_TOPIC_FILTERS, toggleTopic, type TopicSelection } from './topic-chips';

/**
 * РЕЙЛ ДЕСКТОПА: проект, темы, человек — всё, чем сужают выдачу, в одной колонке слева, а
 * справа сразу файлы.
 *
 * Темы — квадраты-галочки: несколько сразу дают пересечение, и галочка говорит это без
 * подписи. Пустые темы приглушены, но стоят: словарь закрытый, и не увидев слова, человек не
 * догадается, что оно бывает. «unsorted» — отдельной строкой красным: это другое состояние, а не
 * ещё одна тема.
 */
export function FilesRail({
  projects,
  activeProject,
  projectId,
  totalFiles,
  writable,
  onProject,
  onNewProject,
  topics,
  selected,
  untopiced,
  untopicedCount,
  onTopics,
  personId,
  personRole,
  onPerson,
  onPersonRole,
}: {
  projects: FileTopic[];
  activeProject?: FileTopic;
  projectId: number;
  totalFiles: number;
  writable: boolean;
  onProject: (projectId: number) => void;
  onNewProject: () => void;
  topics: FileTopic[];
  selected: number[];
  untopiced: boolean;
  untopicedCount: number;
  onTopics: (next: TopicSelection) => void;
  personId: number;
  personRole: PersonRoleFilter;
  onPerson: (id: number) => void;
  onPersonRole: (role: PersonRoleFilter) => void;
}) {
  const atLimit = selected.length >= MAX_TOPIC_FILTERS;
  const orphans = selected.filter((id) => !topics.some((t) => Number(t.id) === id));
  const item = 'py-1.5 text-textBaseSize';
  return (
    <SideRail width={240} className='hidden flex-col p-block lg:flex'>
      <SideRailGroup flush>project</SideRailGroup>
      <ProjectList
        projects={projects}
        activeProject={activeProject}
        projectId={projectId}
        totalFiles={totalFiles}
        onPick={onProject}
        itemClassName={item}
      />
      <div className='flex items-center gap-3 py-1.5'>
        <Button
          variant='underline'
          className='text-labelColor'
          disabled={!writable}
          onClick={onNewProject}
        >
          + new project
        </Button>
        <Button asChild variant='underline' className='ml-auto text-labelColor'>
          <Link to={ROUTES.filesProjects}>all</Link>
        </Button>
      </div>
      <Button asChild variant='underline' className='self-start py-1.5 text-labelColor'>
        <Link to={ROUTES.filesShared}>shared</Link>
      </Button>

      <SideRailGroup
        action={
          <Button asChild variant='underline' size='xs' className='ml-auto px-0 text-labelColor'>
            <Link to={ROUTES.fileTopics}>manage</Link>
          </Button>
        }
      >
        topics
      </SideRailGroup>
      <div role='group' aria-label='topics' className='flex flex-col'>
        {topics.map((t) => {
          const id = Number(t.id);
          const on = selected.includes(id);
          const n = Number(t.filesCount ?? 0);
          const off = atLimit && !on;
          return (
            <SideRailItem
              key={id}
              label={t.name ?? `#${id}`}
              count={n}
              done={on}
              selected={on}
              onClick={off ? undefined : () => onTopics(toggleTopic(selected, id))}
              className={`${item} ${n === 0 && !on ? 'text-borderColor' : ''}`}
            />
          );
        })}
        {orphans.map((id) => (
          <SideRailItem
            key={`orphan-${id}`}
            label={`#${id}`}
            done
            selected
            onClick={() => onTopics(toggleTopic(selected, id))}
            className={item}
          />
        ))}
      </div>
      <div className='mt-2 border-t border-hairline pt-1.5'>
        <SideRailItem
          label='unsorted'
          count={untopicedCount}
          done={untopiced}
          selected={untopiced}
          onClick={() => onTopics({ topicIds: [], untopiced: !untopiced })}
          className={`${item} text-error hover:text-error`}
        />
      </div>

      <SideRailGroup>person</SideRailGroup>
      <PersonFilter
        personId={personId}
        personRole={personRole}
        onPerson={onPerson}
        onPersonRole={onPersonRole}
      />
    </SideRail>
  );
}
