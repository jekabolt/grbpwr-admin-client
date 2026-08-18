import { useEffect, useRef, useState } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Pill } from 'ui/components/pill';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { plural } from '../upload/text';
import { FailureText } from './failure-text';
import { ARCHIVED_WORD } from './topic-chips';

/**
 * РЕЖИМ ПРОЕКТА — проект целиком, разложенный по ролям.
 *
 * Это НЕ отдельный экран и не отдельный роут: холст остаётся тем же самым, меняется только то,
 * чем он занят место сетки. Плитка, выделение, полоса выделения, приём броска, очередь загрузки
 * и одиннадцать пустых состояний живут в `page.tsx` и сюда приезжают готовыми — плитку рисует
 * переданная функция. Второй копии этой машинерии в разделе нет и быть не должно.
 *
 * ГРАММАТИКА — РУЛЕТКА, А НЕ КАРТОЧКА. Секция это заголовок на 2-пиксельной линии и сетка
 * плиток под ним; коробки вокруг нет. Плитка сама по себе — обведённый белый прямоугольник, и
 * обёртка вокруг сетки дала бы ровно то, что DESIGN.md запрещает прямым текстом: блок внутри
 * блока. Разделяет секции 24-пиксельный зазор земли, как разделены все блоки этого приложения.
 */

export type ProjectSectionView = {
  key: string;
  title: string;
  /** Роль в архиве: назначить её нельзя, а снять — можно, поэтому файлы под ней видны. */
  archived?: boolean;
  /** Грей-клауза заголовка: чем эта секция является. */
  question?: React.ReactNode;
  /** Плитки и `total` — ИЗ ОДНОГО ответа. Врозь они разойдутся, и число соврёт. */
  files: LibraryFile[];
  total: number;
  error?: unknown;
  onRetry: () => void;
  /** Ставит `frole=` и уводит в плоскую сетку — там листают и там работают. */
  onShowAll: () => void;
};

/** «12 files» — склонение берётся из модуля очереди, второй машины в разделе нет. */
function filesWord(n: number): string {
  return `${n} ${plural(n, 'file')}`;
}

function ProjectSection({
  section,
  renderTile,
}: {
  section: ProjectSectionView;
  renderTile: (f: LibraryFile) => React.ReactNode;
}) {
  const shown = section.files.length;
  const truncated = section.total > shown;

  return (
    <>
      <SectionHeader
        title={section.title}
        question={
          <>
            {/* ЧИСЛО НАЗЫВАЕТ СЕБЯ ЧЕСТНО. Секция показывает начало, а не всё: «первые 12 из
                412» сказано словами ровно там, где иначе стояло бы «412» над двенадцатью
                плитками — а это и есть та ложь, ради которой счётчик и берётся из ответа
                самой секции. */}
            {truncated ? `first ${shown} of ${section.total}` : filesWord(section.total)}
            {section.question ? ` · ${section.question}` : ''}
          </>
        }
        action={
          <>
            {section.archived && (
              <Pill
                tone='mut'
                title='the role is archived: it can be taken off files, but not put on again'
              >
                {ARCHIVED_WORD}
              </Pill>
            )}
            {/* Кнопки нет, когда показано всё: она обещала бы что-то новое и не давала бы
                ничего, кроме сужения, которое и так стоит рядом чипом. */}
            {truncated && (
              <Button size='xs' variant='secondary' onClick={section.onShowAll}>
                show all ({section.total})
              </Button>
            )}
          </>
        }
      />
      <Tiles min={190}>{section.files.map(renderTile)}</Tiles>
    </>
  );
}

function FailedSection({ section, onRetry }: { section: ProjectSectionView; onRetry: () => void }) {
  return (
    <>
      <SectionHeader title={section.title} question='this section did not load' />
      <CalloutBox tone='error'>
        <div className='flex flex-wrap items-center gap-2.5'>
          <Text size='micro' component='span'>
            <FailureText e={section.error} fallback="the server didn't answer." />
          </Text>
          <Button size='sm' variant='secondary' className='ml-auto' onClick={onRetry}>
            try again
          </Button>
        </div>
      </CalloutBox>
    </>
  );
}

/**
 * ОБОЛОЧКА СЕКЦИИ — ОДНА НА ОБА СОСТОЯНИЯ, и она же мишень фокуса.
 *
 * Кнопка «try again» исчезает ровно тогда, когда повтор УДАЛСЯ, — и фокус вместе с ней падает
 * на `body`. Мишенью взята сама секция, а не первая плитка: человек нажимал «повторить» ради
 * РАЗДЕЛА, и вернуть его надо к разделу, а не к случайному файлу внутри. `tabIndex={-1}` даёт
 * секции принимать фокус программно, не влезая в порядок обхода табом.
 */
function SectionShell({
  section,
  renderTile,
}: {
  section: ProjectSectionView;
  renderTile: (f: LibraryFile) => React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [retried, setRetried] = useState(false);
  const failed = !!section.error;

  useEffect(() => {
    if (retried && !failed) {
      setRetried(false);
      ref.current?.focus();
    }
  }, [retried, failed]);

  return (
    <section ref={ref} tabIndex={-1} className='flex flex-col focus:outline-none'>
      {failed ? (
        <FailedSection
          section={section}
          onRetry={() => {
            setRetried(true);
            section.onRetry();
          }}
        />
      ) : (
        <ProjectSection section={section} renderTile={renderTile} />
      )}
    </section>
  );
}

export function ProjectSections({
  sections,
  emptyRoles,
  pileEmpty,
  renderTile,
}: {
  /** Только непустые (и сломавшиеся): пустая секция — это строка внизу, а не блок. */
  sections: ProjectSectionView[];
  /**
   * Живые роли словаря, которых в этом проекте нет ни у одного файла.
   *
   * ПУСТАЯ СЕКЦИЯ НЕ РИСУЕТСЯ, А НАЗЫВАЕТСЯ. Четыре заголовка с нулём под каждым — это четыре
   * экрана прокрутки ни о чём, и на проекте, где заполнена одна роль, они заслоняют
   * единственное, что там есть. Но и молчать нельзя: словарь ролей закрытый, человек его не
   * придумывает, и не увидев слова «планирование» он не догадается, что оно бывает. Поэтому
   * пустые роли остаются строкой — весь словарь виден, места занимает одну строку.
   *
   * Архивные роли сюда НЕ попадают: назначить их нельзя, и предлагать «сюда можно класть»
   * значило бы предлагать жест, который отвечает отказом.
   */
  emptyRoles: string[];
  /** Приёмной кучи нет — в проекте всё разобрано. Это хорошая новость, и её стоит сказать. */
  pileEmpty: boolean;
  renderTile: (f: LibraryFile) => React.ReactNode;
}) {
  return (
    <>
      {sections.map((s) => (
        <SectionShell key={s.key} section={s} renderTile={renderTile} />
      ))}
      {(emptyRoles.length > 0 || pileEmpty) && (
        <div className='flex flex-col gap-1'>
          {emptyRoles.length > 0 && (
            <Text size='micro' variant='label'>
              not in this project yet: {emptyRoles.join(' · ')}. a role goes on files, from the
              selection bar — not on the section.
            </Text>
          )}
          {pileEmpty && (
            <Text size='micro' variant='label'>
              nothing to sort out: no file in this project is without a role. whatever gets
              dropped here next shows up as a separate “without a role” section — uploading sets
              no role.
            </Text>
          )}
        </div>
      )}
    </>
  );
}
