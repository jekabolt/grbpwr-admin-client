// THE COMPOSITION LABEL'S ARTWORK on the screen: one choice, `built | one file | per cell`, and what
// that choice shows. The row's fields stay as they are above it. An own file is shown as itself; the
// ribbons here only read, the text is edited in `edit text`.
import { useQueries } from '@tanstack/react-query';
import { filesKeys } from 'components/managers/files/hooks/useFiles';
import { filesService } from 'components/managers/files/api/filesService';
import { extensionOf } from 'components/managers/files/utils/format';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { cn } from 'lib/utility';
import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { Button, Chip, ChipRow, Media, Text, Tile } from 'ui';
import { L } from '../../care-labels/layout';
import { previewASides, type PlannedSide } from '../../care-labels/pages';
import type { FullPlan } from '../../care-labels/print-job';
import { isOwnArtworkFile, type ArtworkFile, type LabelAxes } from '../sewn-label-model';
import { wireInt } from '../wire-int';
import { firstCell, oneFileOf, ownCellOf, type ArtworkChoice } from './composition-artwork-model';
import { PX_PER_MM } from './regions';
import { Ribbon, type RibbonSide } from './ribbon';

export type ArtworkCellRef = { colorwayId: number; sizeId: number };

const ALL: ArtworkCellRef = { colorwayId: 0, sizeId: 0 };
const ZOOM = 0.5;
const CHOICES: { value: ArtworkChoice; label: string }[] = [
  { value: 'built', label: 'built' },
  { value: 'one', label: 'one file' },
  { value: 'cell', label: 'per cell' },
];

const NO_FILE_BOX =
  'flex h-32 w-full max-w-64 items-center justify-center border border-dashed border-textColor p-2 text-micro uppercase';

export function ArtworkChoiceChips({
  choice,
  disabled,
  onChoose,
}: {
  choice: ArtworkChoice;
  disabled: boolean;
  onChoose: (choice: ArtworkChoice) => void;
}): JSX.Element {
  return (
    <ChipRow>
      {CHOICES.map((c) => (
        <Chip
          key={c.value}
          nonForm
          pressed={choice === c.value}
          selected={choice === c.value}
          disabled={disabled}
          data-artwork-choice={c.value}
          onClick={() => onChoose(c.value)}
        >
          {c.label}
        </Chip>
      ))}
    </ChipRow>
  );
}

/** The sides of one colour × size as they print: A face, A back, B face, B back, B2 … */
function ribbonSidesOf(plan: FullPlan | null, cell: ArtworkCellRef): RibbonSide[] {
  const set = plan?.sets.get(cell.colorwayId);
  if (!set) return [];
  const toSide = (p: PlannedSide, key: string, caption: string): RibbonSide => ({
    key,
    caption,
    doc: p.side.doc,
    seam: p.side.report.seam,
    blank: p.side.report.empty,
  });
  const { face, back } = previewASides(set, cell.sizeId);
  const out: RibbonSide[] = [];
  if (face) out.push(toSide(face, 'A-face', 'A face'));
  if (back) out.push(toSide(back, 'A-back', 'A back'));
  const rest = [...set.sides.values()]
    .filter((p) => p.label !== 'A')
    .sort(
      (x, y) =>
        Number(x.label.slice(1) || 1) - Number(y.label.slice(1) || 1) ||
        Number(x.role === 'back') - Number(y.role === 'back'),
    );
  for (const p of rest) {
    const key = `${p.label}-${p.role}`;
    out.push(toSide(p, key, `${p.label} ${p.role}`));
  }
  return out;
}

function BuiltSides({
  plan,
  blocked,
  cell,
}: {
  plan: FullPlan | null;
  blocked: ReadonlySet<number>;
  cell: ArtworkCellRef | null;
}): JSX.Element {
  const sides = cell && !blocked.has(cell.colorwayId) ? ribbonSidesOf(plan, cell) : [];
  if (!sides.length) {
    return (
      <div className={NO_FILE_BOX} data-artwork-no-text=''>
        no text
      </div>
    );
  }
  const width = L.W * PX_PER_MM * ZOOM;
  return (
    <div
      className='grid gap-2'
      style={{ gridTemplateColumns: `repeat(auto-fill, ${width}px)` }}
      data-artwork-ribbons=''
    >
      {sides.map((side) => (
        <Ribbon key={side.key} side={side} zoom={ZOOM} regions={[]} onOpen={() => undefined} />
      ))}
    </div>
  );
}

/** The own file as itself: its picture and its name. A click opens it. */
function FileBox({ file, info }: { file?: ArtworkFile; info: FileInfo | undefined }): JSX.Element {
  if (!file) {
    return (
      <div className={NO_FILE_BOX} data-artwork-no-file=''>
        no file
      </div>
    );
  }
  const url = file.publicUrl?.trim() ?? '';
  const name = info?.fileName ?? '';
  return (
    <div className='w-full max-w-64' data-artwork-file={wireInt(file.libraryFileId)}>
      <Tile
        title={name}
        name={name || 'file'}
        className='h-32 border-textColor'
        onClick={
          url ? () => window.open(publicFilePageUrl(url) || url, '_blank', 'noopener') : undefined
        }
        media={
          <span className='flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden'>
            {info?.previewUrl ? (
              <Media src={info.previewUrl} alt='' aspectRatio='auto' fit='contain' />
            ) : (
              <span className='text-micro uppercase'>{name ? extensionOf(name) : 'file'}</span>
            )}
          </span>
        }
      />
    </div>
  );
}

type FileInfo = { fileName?: string; previewUrl?: string };

/** What the library says about the own files in the row. */
function useOwnFileInfo(
  files: readonly ArtworkFile[],
): (file?: ArtworkFile) => FileInfo | undefined {
  const ids = useMemo(
    () => [...new Set(files.map((f) => wireInt(f.libraryFileId)).filter((id) => id > 0))],
    [files],
  );
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: filesKeys.file(id),
      queryFn: () => filesService.getFile(id),
      staleTime: 30 * 60 * 1000,
    })),
  });
  return (file) => {
    const at = file ? ids.indexOf(wireInt(file.libraryFileId)) : -1;
    return at >= 0 ? (results[at]?.data?.file as FileInfo | undefined) : undefined;
  };
}

function Word({
  children,
  onClick,
  disabled,
  data,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  data: string;
}): JSX.Element {
  return (
    <Button
      type='button'
      variant='underline'
      size='xs'
      disabled={disabled}
      data-artwork-action={data}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function CompositionArtwork({
  choice,
  files,
  axes,
  plan,
  blocked,
  canEdit,
  onChoose,
  onClear,
}: {
  choice: ArtworkChoice;
  files: readonly ArtworkFile[];
  axes: LabelAxes;
  plan: FullPlan | null;
  /** Colours the generator cannot make now. */
  blocked: ReadonlySet<number>;
  canEdit: boolean;
  onChoose: (cell: ArtworkCellRef) => void;
  onClear: (cell: ArtworkCellRef) => void;
}): JSX.Element {
  const colorwayIds = axes.colorways.map((c) => c.id);
  const sizeIds = axes.sizes.map((s) => s.id);
  const own = useMemo(() => files.filter(isOwnArtworkFile), [files]);
  const infoOf = useOwnFileInfo(own);
  const [picked, setPicked] = useState<ArtworkCellRef | null>(null);
  const opening = useMemo(
    () => firstCell(files, colorwayIds, sizeIds),
    // The cell it opens on is chosen once the axes are known; later files do not move the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorwayIds.join(), sizeIds.join()],
  );

  if (choice === 'built') {
    const first =
      colorwayIds.length && sizeIds.length
        ? { colorwayId: colorwayIds[0], sizeId: sizeIds[0] }
        : null;
    return <BuiltSides plan={plan} blocked={blocked} cell={first} />;
  }

  if (choice === 'one') {
    const file = oneFileOf(files);
    return (
      <div className='flex flex-col gap-1.5' data-artwork-one=''>
        <FileBox file={file} info={infoOf(file)} />
        <div className='flex items-center gap-3'>
          <Word disabled={!canEdit} data='choose' onClick={() => onChoose(ALL)}>
            choose file
          </Word>
          {file ? (
            <Word disabled={!canEdit} data='clear' onClick={() => onClear(ALL)}>
              clear file
            </Word>
          ) : null}
        </div>
      </div>
    );
  }

  const known = (c: ArtworkCellRef | null) =>
    !!c && colorwayIds.includes(c.colorwayId) && sizeIds.includes(c.sizeId);
  const cell = known(picked) ? picked : opening;
  const file = cell ? ownCellOf(files, cell.colorwayId, cell.sizeId) : undefined;
  const colourName = axes.colorways.find((c) => c.id === cell?.colorwayId)?.name ?? '';
  const sizeName = axes.sizes.find((s) => s.id === cell?.sizeId)?.label ?? '';

  return (
    <div className='flex flex-wrap items-start gap-x-8 gap-y-4' data-artwork-cells=''>
      <div className='overflow-x-auto'>
        <table className='border-separate border-spacing-1 text-micro tabular-nums'>
          <thead>
            <tr className='text-labelColor uppercase'>
              <th aria-label='colour' />
              {axes.sizes.map((s) => (
                <th key={s.id} className='font-normal'>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axes.colorways.map((c) => (
              <tr key={c.id}>
                <td className='max-w-28 truncate pr-2 uppercase' title={c.name}>
                  {c.name}
                </td>
                {axes.sizes.map((s) => {
                  const isOwn = !!ownCellOf(files, c.id, s.id);
                  const pressed = cell?.colorwayId === c.id && cell.sizeId === s.id;
                  return (
                    <td key={s.id} className='p-0'>
                      <Button
                        type='button'
                        variant={pressed ? 'main' : 'secondary'}
                        size='xs'
                        aria-pressed={pressed}
                        aria-label={`${c.name} ${s.label}: ${isOwn ? 'own file' : 'built'}`}
                        data-artwork-cell={`${c.id}:${s.id}`}
                        data-artwork-own={isOwn ? '1' : '0'}
                        onClick={() => setPicked({ colorwayId: c.id, sizeId: s.id })}
                        className={cn(
                          'h-9 w-14 text-micro',
                          !pressed && isOwn && 'border-textColor',
                          !pressed && !isOwn && 'bg-pageBg text-labelColor',
                        )}
                      >
                        {isOwn ? 'file' : 'built'}
                      </Button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cell ? (
        <div
          className='flex min-w-0 flex-1 flex-col gap-1.5 border-l border-hairline pl-8'
          data-artwork-panel={`${cell.colorwayId}:${cell.sizeId}`}
        >
          <Text size='micro' className='uppercase'>
            {colourName} · {sizeName}
          </Text>
          {file ? (
            <FileBox file={file} info={infoOf(file)} />
          ) : (
            <BuiltSides plan={plan} blocked={blocked} cell={cell} />
          )}
          <div className='flex items-center gap-3'>
            {file ? (
              <Word disabled={!canEdit} data='use-built' onClick={() => onClear(cell)}>
                use built
              </Word>
            ) : null}
            <Word disabled={!canEdit} data='choose' onClick={() => onChoose(cell)}>
              choose file
            </Word>
          </div>
        </div>
      ) : null}
    </div>
  );
}
