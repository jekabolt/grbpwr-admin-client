import {
  useMemo,
  useState,
  type ChangeEvent,
  type ElementType,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  Button,
  DrawingPinIcon,
  Half2Icon,
  Input,
  LayersIcon,
  Pill,
  ScissorsIcon,
  SewingPinIcon,
  Text,
  ValueIcon,
} from 'ui';

export type PatternImportDxfPhaseECadWorkbenchObjectCategoryV1 =
  | 'all'
  | 'dress-form'
  | 'patterns'
  | 'seams'
  | 'pins'
  | 'fabrics';

export type PatternImportDxfPhaseECadWorkbenchObjectPieceV1 = Readonly<{
  objectKey?: string;
  pieceId: string;
  label: string;
  quantity?: number;
  preview?: ReactNode;
  /** False for session-local geometry that is visible on canvas but has no sealed projection yet. */
  focusable?: boolean;
  statusLabel?: string;
}>;

export type PatternImportDxfPhaseECadWorkbenchObjectSidebarPropsV1 = Readonly<{
  pieces: readonly PatternImportDxfPhaseECadWorkbenchObjectPieceV1[];
  seams?: readonly Readonly<{
    seamId: string;
    label: string;
    active: boolean;
  }>[];
  selectedPieceIds?: readonly string[];
  selectionDetails?: ReactNode;
  dressFormLabel?: string;
  seamCount?: number;
  pinCount?: number;
  fabricCount?: number;
  materialScopes?: readonly Readonly<{
    scopeKey: string;
    label: string;
    pieceCount: number;
    active: boolean;
  }>[];
  issueCount?: number;
  onFocusPiece?: (pieceKey: string, options: Readonly<{ toggle: boolean }>) => void;
  onFocusSeam?: (seamId: string) => void;
  onFocusNextIssue?: () => void;
  defaultCategory?: PatternImportDxfPhaseECadWorkbenchObjectCategoryV1;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}>;

const CATEGORIES: readonly Readonly<{
  id: PatternImportDxfPhaseECadWorkbenchObjectCategoryV1;
  label: string;
  icon: ElementType;
}>[] = Object.freeze([
  { id: 'all', label: 'All objects', icon: LayersIcon },
  { id: 'dress-form', label: 'Dress form', icon: ValueIcon },
  { id: 'patterns', label: 'Patterns', icon: ScissorsIcon },
  { id: 'seams', label: 'Seams', icon: SewingPinIcon },
  { id: 'pins', label: 'Pins', icon: DrawingPinIcon },
  { id: 'fabrics', label: 'Fabrics', icon: Half2Icon },
]);

export function resolvePatternImportDxfPhaseECadWorkbenchObjectCategoriesV1(
  input: Readonly<{
    hasDressForm: boolean;
    pieceCount: number;
    seamCount: number;
    pinCount: number;
    fabricCount: number;
  }>,
) {
  return CATEGORIES.filter(({ id }) => {
    if (id === 'all') return true;
    if (id === 'dress-form') return input.hasDressForm;
    if (id === 'patterns') return input.pieceCount > 0;
    if (id === 'seams') return input.seamCount > 0;
    if (id === 'pins') return input.pinCount > 0;
    return input.fabricCount > 0;
  });
}

/**
 * Presentation-only Drape-style object browser. The caller remains the selection/data owner; this
 * component only filters the supplied objects and publishes explicit focus intent.
 */
export function PatternImportDxfPhaseECadWorkbenchObjectSidebarV1({
  pieces,
  seams = [],
  selectedPieceIds = [],
  selectionDetails = null,
  dressFormLabel = '',
  seamCount = 0,
  pinCount = 0,
  fabricCount = 0,
  materialScopes = [],
  issueCount = 0,
  onFocusPiece,
  onFocusSeam,
  onFocusNextIssue,
  defaultCategory = 'all',
  defaultCollapsed = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
}: PatternImportDxfPhaseECadWorkbenchObjectSidebarPropsV1) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = (next: boolean) => {
    setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };
  const [category, setCategory] =
    useState<PatternImportDxfPhaseECadWorkbenchObjectCategoryV1>(defaultCategory);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(true);
  const [patternsOpen, setPatternsOpen] = useState(true);
  const availableCategories = useMemo(
    () =>
      resolvePatternImportDxfPhaseECadWorkbenchObjectCategoriesV1({
        hasDressForm: dressFormLabel.trim().length > 0,
        pieceCount: pieces.length,
        seamCount: Math.max(seamCount, seams.length),
        pinCount,
        fabricCount: Math.max(fabricCount, materialScopes.length),
      }),
    [
      dressFormLabel,
      fabricCount,
      materialScopes.length,
      pieces.length,
      pinCount,
      seamCount,
      seams.length,
    ],
  );
  const activeCategory = availableCategories.some(({ id }) => id === category) ? category : 'all';
  const filteredPieces = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return pieces;
    return pieces.filter(({ label }) => label.toLocaleLowerCase().includes(normalized));
  }, [pieces, query]);
  const showForm =
    dressFormLabel.trim().length > 0 &&
    (activeCategory === 'all' || activeCategory === 'dress-form');
  const showPatterns = activeCategory === 'all' || activeCategory === 'patterns';

  if (collapsed)
    return (
      <aside
        className='flex h-full w-11 shrink-0 flex-col items-center border-r border-borderColor bg-bgColor py-2'
        aria-label='Objects sidebar'
        data-cad-object-sidebar='collapsed'
      >
        <Button
          type='button'
          size='xs'
          variant='underline'
          className='h-9 w-9 border-0 bg-transparent p-0'
          aria-label='Show objects sidebar'
          onClick={() => setCollapsed(false)}
        >
          ≡
        </Button>
      </aside>
    );

  return (
    <aside
      className='flex h-full w-56 shrink-0 flex-col overflow-hidden border-r border-borderColor bg-bgColor'
      aria-label='Objects sidebar'
      data-cad-object-sidebar='expanded'
    >
      <div className='flex shrink-0 items-center gap-1 border-b border-borderColor p-1'>
        <div
          className='flex min-w-0 flex-1 items-center gap-0.5'
          role='tablist'
          aria-label='Objects'
        >
          {availableCategories.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type='button'
              variant='default'
              className={`flex h-8 w-8 items-center justify-center ${
                activeCategory === id
                  ? 'bg-textColor text-bgColor'
                  : 'text-labelColor hover:bg-pageBg hover:text-textColor'
              }`}
              role='tab'
              aria-selected={activeCategory === id}
              aria-label={label}
              title={label}
              onClick={() => setCategory(id)}
            >
              <Icon aria-hidden width='16' height='16' />
            </Button>
          ))}
        </div>
        <Button
          type='button'
          size='xs'
          variant='underline'
          className='h-8 w-8 border-0 bg-transparent p-0'
          aria-label='Hide objects sidebar'
          onClick={() => setCollapsed(true)}
        >
          ‹
        </Button>
      </div>

      <div className='shrink-0 border-b border-borderColor p-2'>
        <Input
          type='text'
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          placeholder='Find an object'
          aria-label='Find an object'
          className='h-8 border-0 bg-pageBg text-micro'
        />
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto p-2' data-cad-object-tree=''>
        {showForm ? (
          <details
            className='border-b border-hairline pb-2'
            aria-label='Dress form objects'
            open={formOpen}
            onToggle={(event) => setFormOpen(event.currentTarget.open)}
          >
            <summary className='cursor-pointer list-none text-micro font-bold marker:hidden'>
              Dress form
            </summary>
            <div className='mt-1 bg-pageBg px-2 py-1.5 text-micro font-bold'>{dressFormLabel}</div>
          </details>
        ) : null}

        {showPatterns ? (
          <details
            className='border-b border-hairline py-2'
            open={patternsOpen}
            onToggle={(event) => setPatternsOpen(event.currentTarget.open)}
          >
            <summary className='flex cursor-pointer list-none items-center gap-2 text-micro font-bold marker:hidden'>
              <span>Patterns</span>
              <Pill tone='ink'>{pieces.length}</Pill>
            </summary>
            <ol className='mt-1 space-y-1'>
              {filteredPieces.map((piece) => {
                const objectKey = piece.objectKey ?? piece.pieceId;
                const selected = selectedPieceIds.includes(objectKey);
                const focusable = piece.focusable !== false && Boolean(onFocusPiece);
                const content = (
                  <>
                    <span className='flex h-9 w-9 flex-none items-center justify-center'>
                      {piece.preview ?? <span aria-hidden>◇</span>}
                    </span>
                    <span className='min-w-0 flex-1 truncate font-bold'>{piece.label}</span>
                    <span className='tabular-nums text-labelColor'>
                      {piece.statusLabel ?? `×${piece.quantity ?? 1}`}
                    </span>
                  </>
                );
                return (
                  <li key={objectKey}>
                    {focusable ? (
                      <Button
                        type='button'
                        variant='default'
                        className={`flex w-full items-center gap-2 px-1.5 py-1 text-left text-micro ${
                          selected
                            ? 'bg-pageBg text-textColor'
                            : 'text-labelColor hover:bg-pageBg hover:text-textColor'
                        }`}
                        aria-pressed={selected}
                        data-cad-object-piece={piece.pieceId}
                        data-cad-object-key={objectKey}
                        onClick={(event: ReactMouseEvent<HTMLButtonElement>) =>
                          onFocusPiece?.(objectKey, { toggle: event.shiftKey })
                        }
                      >
                        {content}
                      </Button>
                    ) : (
                      <div
                        className={`flex w-full items-center gap-2 px-1.5 py-1 text-left text-micro ${
                          selected ? 'bg-pageBg text-textColor' : 'text-labelColor'
                        }`}
                        data-cad-object-piece={piece.pieceId}
                        data-cad-object-key={objectKey}
                        data-cad-object-piece-readonly=''
                      >
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>
        ) : null}

        {activeCategory === 'seams' ? (
          seams.length ? (
            <ol className='space-y-1' data-cad-object-seam-list=''>
              {seams.map((seam, index) => (
                <li key={seam.seamId}>
                  {onFocusSeam ? (
                    <Button
                      type='button'
                      variant='default'
                      className={`flex w-full items-center gap-2 px-2 py-2 text-left text-micro ${
                        seam.active
                          ? 'bg-textColor text-bgColor'
                          : 'text-labelColor hover:bg-pageBg hover:text-textColor'
                      }`}
                      aria-pressed={seam.active}
                      data-cad-object-seam={seam.seamId}
                      onClick={() => onFocusSeam(seam.seamId)}
                    >
                      <span className='min-w-0 flex-1 truncate font-bold'>{seam.label}</span>
                      <span className='tabular-nums opacity-70'>{index + 1}</span>
                    </Button>
                  ) : (
                    <div
                      className={`flex w-full items-center gap-2 px-2 py-2 text-left text-micro ${
                        seam.active ? 'bg-textColor text-bgColor' : 'text-labelColor'
                      }`}
                      data-cad-object-seam={seam.seamId}
                      data-cad-object-seam-readonly=''
                    >
                      <span className='min-w-0 flex-1 truncate font-bold'>{seam.label}</span>
                      <span className='tabular-nums opacity-70'>{index + 1}</span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <ObjectCount label='Seams' count={seamCount} />
          )
        ) : null}
        {activeCategory === 'pins' ? <ObjectCount label='Pins' count={pinCount} /> : null}
        {activeCategory === 'fabrics' ? (
          materialScopes.length ? (
            <ul className='divide-y divide-hairline' data-cad-material-scope-list=''>
              {materialScopes.map((scope) => (
                <li
                  key={scope.scopeKey}
                  className='flex items-center gap-2 py-2 text-micro'
                  data-cad-material-scope={scope.scopeKey}
                  data-cad-material-scope-active={scope.active ? '' : undefined}
                >
                  <span className='min-w-0 flex-1 truncate font-bold'>{scope.label}</span>
                  <span className='text-labelColor'>{scope.pieceCount} pieces</span>
                  {scope.active ? <Pill tone='ink'>visible</Pill> : null}
                </li>
              ))}
            </ul>
          ) : (
            <ObjectCount label='Fabrics' count={fabricCount} />
          )
        ) : null}
      </div>

      {selectionDetails}

      {issueCount ? (
        <div className='shrink-0 border-t border-borderColor p-2' data-cad-object-issues=''>
          {onFocusNextIssue ? (
            <Button
              type='button'
              size='xs'
              variant='underline'
              className='w-full justify-between'
              onClick={onFocusNextIssue}
              data-cad-focus-next-issue=''
            >
              <span>{issueCount} issues</span>
              <span aria-hidden>Next →</span>
            </Button>
          ) : (
            <Text component='p' size='micro' variant='label' data-cad-object-issues-readonly=''>
              {issueCount} issues
            </Text>
          )}
        </div>
      ) : null}
    </aside>
  );
}

function ObjectCount({ label, count }: Readonly<{ label: string; count: number }>) {
  return (
    <div className='flex items-center justify-between border-b border-hairline py-2 text-micro'>
      <span className='font-bold'>{label}</span>
      <Pill tone='ink'>{count}</Pill>
    </div>
  );
}
