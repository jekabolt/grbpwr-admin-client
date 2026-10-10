// ASSEMBLY MAP — блок колонки 320px на вкладке CONSTRUCTION (04-ASSEMBLY-MAP-DESIGN.md).
//
// Три вида одного вопроса «что с чем сшивают и какой кромкой»:
//   STEP   — активный шаг рельса крупно (по умолчанию, D2);
//   PIECES — все семейства деталей с номерами шагов у кромок;
//   SKETCH — сегодняшний эскиз с пинами.
// Всё нарисованное — из графа швов, который карточка уже читает для пиктограмм узлов; второго
// прохода геометрии нет (§7). Нет контуров / граф не прочитан — переключателя нет, блок —
// сегодняшний эскиз байт в байт (D3).
//
// Карта — ЧИТАТЕЛЬ: пути записи у неё нет. Неверное чтение правят в рельсе, где правят шаг.
import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { SectionHeader } from 'ui/components/section-header';
import { ViewSwitch, type ViewSwitchOption } from 'ui/components/view-switch';
import { useOperationWorkCatalog } from '../useOperationWorkCatalog';
import { activeOf, useActiveStep, useActiveStepStore } from './active-step';
import { PiecesView } from './pieces-view';
import { StepView } from './step-view';
import type { SewnField } from './sewn';
import { useMapModel } from './use-map-model';

export type MapView = 'step' | 'pieces' | 'sketch';

const VIEWS = [
  { value: 'step', label: 'step', hint: 'the active step: its inputs pulled apart at the seam' },
  {
    value: 'pieces',
    label: 'pieces',
    hint: 'every piece once, each sewn edge numbered by its step',
  },
  { value: 'sketch', label: 'sketch', hint: 'the technical sketch with callout pins' },
] as const satisfies readonly ViewSwitchOption<MapView>[];

const QUESTION: Record<MapView, string> = {
  step: '— what joins what, at which edge',
  pieces: '— sewn edges, numbered by step',
  sketch: '— hovering an operation lights its pin, and the other way round',
};

// Выбор вида — ПРЕЗЕНТАЦИЯ, а не данные карточки: localStorage на карточку, форма не грязнеет.
const viewKey = (id: string | undefined) => `plm.techcard.assembly-map.view.${id ?? 'new'}`;
function readView(id: string | undefined): MapView {
  try {
    const v = localStorage.getItem(viewKey(id));
    return v === 'pieces' || v === 'sketch' ? v : 'step';
  } catch {
    return 'step';
  }
}

export function AssemblyMap({ sketch }: { sketch: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<MapView>(() => readView(id));
  useEffect(() => {
    try {
      localStorage.setItem(viewKey(id), view);
    } catch {
      /* private mode: the choice lives for the session */
    }
  }, [id, view]);
  const model = useMapModel();
  const snap = useActiveStep();
  const store = useActiveStepStore();
  const { catalog: workCatalog } = useOperationWorkCatalog();

  // Без графа — сегодняшний блок эскиза, байт в байт (D3, §6).
  if (!model.read) {
    return (
      <section className='border border-borderColor bg-bgColor p-4'>
        <SectionHeader
          title='sketch — assembly map'
          question='— hovering an operation lights its pin, and the other way round'
        />
        {sketch}
      </section>
    );
  }

  const count = model.ops.length;
  const chosen = activeOf(snap);
  const index = chosen != null && chosen < count ? chosen : model.firstMachine;
  const pick = (i: number) => store?.select(i, 'map');
  // ДВЕРЬ ПУСТОГО СЛОТА: шаг открывается в рельсе, затем фокус встаёт в его поле (селект Radix —
  // кнопка `combobox` рядом со скрытым нативным `select[name]`). Редактор монтируется кадром позже.
  const door = (i: number, field: SewnField) => {
    store?.select(i, 'map');
    // Селект Radix без нативного двойника: поле ищется по подписи («seam class», «machine *» /
    // «on what *»), фокус — в его кнопку `combobox`.
    const labels = field === 'seamClass' ? ['seam class'] : ['machine', 'on what'];
    let tries = 0;
    let opened = false;
    const seek = () => {
      const editor = document.querySelector('[data-step-editor]');
      const label = Array.from(editor?.querySelectorAll('label') ?? []).find((l) =>
        labels.some((w) => (l.textContent ?? '').trim().toLowerCase().startsWith(w)),
      );
      let host: HTMLElement | null = label?.parentElement ?? null;
      while (host && host !== editor && !host.querySelector('[role="combobox"]'))
        host = host.parentElement;
      const target = host?.querySelector<HTMLElement>('[role="combobox"]');
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.focus();
        return;
      }
      // Поле класса шва живёт в створке «differs from standard»: строка «seam · …» её открывает.
      if (editor && !opened && field === 'seamClass') {
        const summary = Array.from(editor.querySelectorAll<HTMLElement>('button')).find((b) =>
          (b.textContent ?? '').trim().startsWith('seam ·'),
        );
        if (summary) {
          opened = true;
          summary.click();
        }
      }
      if (++tries < 20) window.setTimeout(seek, 50);
    };
    window.setTimeout(seek, 30);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || view === 'sketch' || count === 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [role="radiogroup"]')) return;
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const from = index ?? -1;
    store?.select(Math.max(0, Math.min(count - 1, from + step)), 'rail');
  };

  return (
    <section
      className='border border-borderColor bg-bgColor p-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
      data-assembly-map={view}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label='assembly map — ↑ / ↓ walk the steps'
    >
      <SectionHeader title='assembly map' question={QUESTION[view]} />
      <div className='mb-2.5'>
        <ViewSwitch<MapView>
          label='assembly map view'
          value={view}
          onChange={setView}
          options={VIEWS}
        />
      </div>
      {view === 'step' ? (
        index != null ? (
          <StepView
            model={model}
            index={index}
            workCatalog={workCatalog}
            onPick={pick}
            onDoor={door}
          />
        ) : null
      ) : view === 'pieces' ? (
        <PiecesView
          model={model}
          active={chosen != null && chosen < count ? chosen : null}
          onHover={(i) => store?.hover(i)}
          onHoverMany={(list) => store?.hoverMany(list)}
          onPick={pick}
        />
      ) : (
        sketch
      )}
    </section>
  );
}
