// СТЕНД ГАЛЕРЕИ УКАЗАНИЙ — НА РЕПОЗИТОРНЫХ КОМПОНЕНТАХ. Монтирует НАСТОЯЩИЙ FocusedAnnotator со
// всем, что под ним (AnnotationSurface, AnnotationEditor, ViewSwitch, TileFooter/useReorder,
// зум-диалог), и держит данные в локальном состоянии — роль владельца формы играет этот файл.
//
// Прогоняется `scripts/annotation-canvas-probe.mjs` (см. `yarn canvas:gallery`). Здесь ТОЛЬКО
// сцена; все замеры и мутации живут в драйвере.
//
// Три ручки для драйвера, каждая под своим ключом/вызовом и каждая нужна для замера, который
// иначе невозможен:
//   `probe.two` (localStorage) — вторая галерея на той же странице: у неё СВОЙ `onRemove`, и это
//       единственный способ увидеть, чья поверхность обслужила клавишу;
//   `window.__hideNeighbour` — спрятать её в `hidden` посреди жизни: вкладки карточки смонтированы
//       все разом, и сторож скрытой вкладки проверяется только так;
//   `window.__dropView` — снять кадр с листа ПОСРЕДИ жеста перетаскивания: исходный узел
//       размонтирован, `dragend` доставлять некому, и виден второй рубеж сторожа залипшего жеста.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnnotationEditor } from 'ui/components/annotation/editor';
import type { ShapePoint, SurfaceCallout, PenStyle } from 'ui/components/annotation/surface';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { ViewSwitch } from 'ui/components/view-switch';

type C = {
  key: string;
  mediaId: number;
  number: number;
  kind: string;
  points: ShapePoint[];
  label: ShapePoint;
  text: string;
  color: string;
  dashed: boolean;
  filled: boolean;
};

// Картинка — data-URI, чтобы стенд не ходил в сеть вовсе.
const PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'><rect width='300' height='400' fill='%23ddd'/></svg>",
  );

const media = (id: number) =>
  ({
    id,
    media: { fullSize: { mediaUrl: PIC, width: 300, height: 400 }, thumbnail: { mediaUrl: PIC } },
  }) as never;

let seq = 100;

// СОСЕДНЯЯ ГАЛЕРЕЯ НА ТОЙ ЖЕ СТРАНИЦЕ — только под флагом `probe.two`, чтобы не менять разметку
// остальным пробам. Она нужна ровно для одного вопроса: слушатель клавиш висит на window У КАЖДОЙ
// поверхности, и у чужой галереи СВОЙ `onRemove`, пишущий в СВОЙ список. Если сторож владения снят,
// Backspace обслуживает та поверхность, что зарегистрировалась раньше, — то есть ЧУЖАЯ, — и тогда
// выбранная выноска не удаляется вовсе, а чужая история получает пустую запись.
function Neighbour() {
  const [rows, setRows] = useState<C[]>([
    { key: 'x1', mediaId: 44, number: 9, kind: 'pin', points: [{ x: 0.5, y: 0.5 }], label: { x: 0.5, y: 0.5 }, text: 'neighbour', color: '', dashed: false, filled: false },
  ]);
  const [hits, setHits] = useState(0);
  const views: FocusedView[] = [{ key: 'v44', mediaId: 44, full: media(44) }];
  return (
    <div>
      <FocusedAnnotator
        layout='grid'
        views={views}
        calloutsFor={(mediaId: number) =>
          rows
            .filter((c) => c.mediaId === mediaId)
            .map((c) => ({ ...c, hasText: !!c.text.trim() })) as SurfaceCallout[]
        }
        onEditPoints={() => {}}
        onMoveCallout={() => {}}
        onRemoveCallout={(key: string) => {
          setHits((n) => n + 1);
          setRows((prev) => prev.filter((c) => c.key !== key));
        }}
        renderEditor={() => null}
        onAddCallout={() => {}}
        onPickMedia={() => []}
        onRemoveMedia={() => {}}
        addLabel='add view'
        purpose='probe2'
        emptyLabel='nothing'
        fallbackAspect='3/4'
        carouselLabel='neighbour images'
        mediaLabel={() => 'neighbour'}
      />
      <pre id='state2' style={{ position: 'fixed', left: -9999, top: 0 }}>
        {JSON.stringify({ hits, rows: rows.map((r) => r.key) })}
      </pre>
    </div>
  );
}

function Harness() {
  const [order, setOrder] = useState<number[]>([11, 22, 33]);
  const [kinds, setKinds] = useState<Record<number, string>>({ 11: 'front', 22: 'back', 33: 'detail' });
  const [callouts, setCallouts] = useState<C[]>([
    { key: 'a1', mediaId: 11, number: 1, kind: 'pin', points: [{ x: 0.3, y: 0.3 }], label: { x: 0.3, y: 0.3 }, text: 'one', color: '', dashed: false, filled: false },
    { key: 'a2', mediaId: 11, number: 2, kind: 'label', points: [{ x: 0.6, y: 0.6 }], label: { x: 0.7, y: 0.5 }, text: 'two', color: '', dashed: false, filled: false },
    { key: 'b1', mediaId: 22, number: 3, kind: 'pin', points: [{ x: 0.4, y: 0.4 }], label: { x: 0.4, y: 0.4 }, text: 'three', color: '', dashed: false, filled: false },
    { key: 'b2', mediaId: 22, number: 4, kind: 'dim', points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }], label: { x: 0.5, y: 0.3 }, text: 'four', color: '', dashed: false, filled: false },
  ]);
  const [railMode, setRailMode] = useState<'strip' | 'grid'>(
    () => (localStorage.getItem('probe.rail') as 'strip' | 'grid') ?? 'strip',
  );
  const history = useRef<C[][]>([]);
  // СЧЁТЧИКИ ВЫЗОВОВ, А НЕ ДЛИНЫ СПИСКА. Удаление по ключу идемпотентно: три поверхности,
  // позвавшие onRemove с одним ключом, оставили бы список ровно таким же, как одна, — и
  // мульти-делит был бы невидим. Считаем ЗВОНКИ.
  const [calls, setCalls] = useState({ remove: 0, undo: 0 });
  // СНИМОК «ЧТО УШЛО БЫ НА СЕРВЕР». Роль формы играет этот файл, поэтому Save = прочитать список
  // указаний ровно так, как его читает `form.handleSubmit`: из состояния владельца, а не с экрана.
  const [submitted, setSubmitted] = useState<C[] | null>(null);
  const [hideNb, setHideNb] = useState(false);
  (window as unknown as { __hideNeighbour?: (v: boolean) => void }).__hideNeighbour = setHideNb;

  const views: FocusedView[] = order.map((id) => ({ key: `v${id}`, mediaId: id, full: media(id) }));

  // РУЧКА ДЛЯ ПРОБЫ: снять кадр с листа ПОСРЕДИ жеста. Настоящий случай, ради которого заведён
  // сторож залипшего перетаскивания, — исходный узел размонтировался, пока его тащили (рефетч
  // сменил id). Кликом это не воспроизвести: во время нативного drag'а клика нет.
  (window as unknown as { __dropView?: (i: number) => void }).__dropView = (i: number) =>
    setOrder((prev) => prev.filter((_, k) => k !== i));

  const calloutsFor = useCallback(
    (mediaId: number): SurfaceCallout[] =>
      callouts
        .filter((c) => c.mediaId === mediaId)
        .map((c) => ({
          key: c.key,
          number: c.number,
          kind: c.kind,
          points: c.points,
          label: c.label,
          text: c.text,
          hasText: !!c.text.trim(),
          color: c.color,
          dashed: c.dashed,
          filled: c.filled,
        })),
    [callouts],
  );

  const byKey = useMemo(() => new Map(callouts.map((c) => [c.key, c])), [callouts]);

  return (
    <div style={{ padding: 16, width: '100%', maxWidth: 1100, boxSizing: 'border-box' }}>
      {/* СКРЫТАЯ ВКЛАДКА. Вкладки карточки смонтированы все разом, переключение — это `hidden`,
          а слушатель клавиш висит на window у КАЖДОЙ поверхности и переживает уход с вкладки. */}
      {localStorage.getItem('probe.two') === '1' && (
        <div hidden={hideNb}>
          <Neighbour />
        </div>
      )}
      <FocusedAnnotator
        layout='grid'
        views={views}
        calloutsFor={calloutsFor}
        gridRowHeight={railMode === 'strip' ? 300 : undefined}
        railWrap={railMode === 'grid'}
        viewControls={
          <ViewSwitch
            label='gallery layout'
            value={railMode}
            onChange={(v) => {
              setRailMode(v);
              localStorage.setItem('probe.rail', v);
            }}
            options={[
              { value: 'strip', label: 'strip', hint: 'one row' },
              { value: 'grid', label: 'grid', hint: 'wrapped' },
            ]}
          />
        }
        onReorderMedia={(from, to) => {
          setOrder((prev) => {
            const next = prev.slice();
            const [it] = next.splice(from, 1);
            next.splice(Math.max(0, Math.min(to, next.length)), 0, it);
            return next;
          });
        }}
        onBeforeMutate={() => {
          history.current.push(callouts);
        }}
        onUndo={() => {
          setCalls((c) => ({ ...c, undo: c.undo + 1 }));
          const prev = history.current.pop();
          if (prev) setCallouts(prev);
        }}
        canUndo={() => history.current.length > 0}
        onAddCallout={(mediaId: number, kind: string, points: ShapePoint[], pen: PenStyle) => {
          seq += 1;
          const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
          const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
          setCallouts((prev) => [
            ...prev,
            {
              key: `n${seq}`,
              mediaId,
              number: prev.length + 1,
              kind,
              // Тот же путь, что у формы: строки с четырьмя знаками и обратно.
              points: points.map((p) => ({ x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)) })),
              label: { x: cx, y: cy },
              text: '',
              color: pen.color,
              dashed: pen.dashed,
              filled: pen.filled,
            },
          ]);
        }}
        onEditPoints={(key: string, points: ShapePoint[]) =>
          setCallouts((prev) => prev.map((c) => (c.key === key ? { ...c, points } : c)))
        }
        onMoveCallout={(key: string, x: number, y: number) =>
          setCallouts((prev) => prev.map((c) => (c.key === key ? { ...c, label: { x, y } } : c)))
        }
        onRemoveCallout={(key: string) => {
          setCalls((c) => ({ ...c, remove: c.remove + 1 }));
          setCallouts((prev) => prev.filter((c) => c.key !== key));
        }}
        renderEditor={(key: string, { close }: { close: () => void }) => {
          const c = byKey.get(key);
          if (!c) return null;
          return (
            <AnnotationEditor
              kind={c.kind}
              number={c.number}
              heading={`picture ${order.indexOf(c.mediaId) + 1}`}
              text={c.text}
              color={c.color}
              dashed={c.dashed}
              filled={c.filled}
              pieceKeys={[]}
              onText={(v: string) =>
                setCallouts((prev) => prev.map((x) => (x.key === key ? { ...x, text: v } : x)))
              }
              onColor={() => {}}
              onDashed={() => {}}
              onFilled={() => {}}
              onPieces={() => {}}
              onRemove={() => {
                setCallouts((prev) => prev.filter((x) => x.key !== key));
                close();
              }}
              onClose={close}
            />
          );
        }}
        onPickMedia={() => []}
        onRemoveMedia={() => {}}
        addLabel='add view'
        purpose='probe'
        emptyLabel='nothing'
        fallbackAspect='3/4'
        previewFirst
        mediaLabel={(v: FocusedView) => `picture ${order.indexOf(v.mediaId) + 1}`}
        carouselLabel='probe images'
        renderFocusedFooter={(v: FocusedView) => (
          <div data-footer-kind={kinds[v.mediaId]} className='text-nano'>
            kind: {kinds[v.mediaId]}
          </div>
        )}
      />
      {/* SAVE КАРТОЧКИ — вне галереи, как настоящая кнопка в шапке. Ни сменой инструмента, ни
          размонтированием поверхности он не является: именно поэтому он и интересен. */}
      <button id='save' type='button' onClick={() => setSubmitted(callouts)}>
        save
      </button>
      {/* ЗЕРКАЛО ДАННЫХ ДЛЯ ЗАМЕРА — не участвует в раскладке галереи. */}
      <pre
        id='state'
        style={{ position: 'fixed', left: -9999, top: 0 }}
      >{JSON.stringify({ order, callouts, calls, submitted })}</pre>
    </div>
  );
}

// Провайдеры оболочки — те же, что в приложении: без них react-query внутри пикера медиа роняет
// монтирование целиком, и ВСЕ пробы краснеют по одной посторонней причине.
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <Harness />
  </QueryClientProvider>,
);
