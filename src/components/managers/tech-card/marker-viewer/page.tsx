import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { markerToView } from 'components/managers/tech-card/components/nesting/marker-io';
import { ROUTES } from 'constants/routes';
import { renderLayoutSvg } from 'lib/nesting/render/svg';
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  CalloutBox,
  Chip,
  EmptyCell,
  HeaderNote,
  Pill,
  Section,
  SkeletonBlocks,
  Text,
  Toolbar,
  ToolbarSpacer,
} from 'ui';
import './marker-viewer.css';

const markerKey = (id: number) => ['tech-card-marker', id] as const;

const formatWidth = (value: number) => Number(value.toFixed(1)).toString();
const formatLength = (value: number) => `${(value / 100).toFixed(2)} m`;
const formatEfficiency = (value: number) => `${(value * 100).toFixed(1)}%`;

function pieceIdFromTarget(target: EventTarget): number | undefined {
  if (!(target instanceof Element)) return undefined;
  const group = target.closest('[data-marker-piece-id]');
  const id = Number(group?.getAttribute('data-marker-piece-id'));
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function TechCardMarkerViewer() {
  const params = useParams<{ id: string; markerId: string }>();
  const techCardId = Number(params.id);
  const markerId = Number(params.markerId);
  const validIds =
    Number.isSafeInteger(techCardId) &&
    techCardId > 0 &&
    Number.isSafeInteger(markerId) &&
    markerId > 0;

  const markerQuery = useQuery({
    queryKey: markerKey(markerId),
    enabled: validIds,
    queryFn: async () => {
      const response = await adminService.GetTechCardMarker({ id: markerId });
      if (!response.marker) throw new Error('Marker unavailable');
      return response.marker;
    },
  });

  const view = useMemo(
    () => (markerQuery.data ? markerToView(markerQuery.data) : undefined),
    [markerQuery.data],
  );
  const markerBelongsToCard = markerQuery.data?.summary?.techCardId === techCardId;
  const [selectedPieceId, setSelectedPieceId] = useState<number>();

  useEffect(() => {
    setSelectedPieceId(view?.pieces[0]?.id);
  }, [markerId, view]);

  const quantityByPieceId = useMemo(() => {
    const quantities = new Map<number, number>();
    for (const placement of view?.result.placements ?? []) {
      quantities.set(placement.pieceId, (quantities.get(placement.pieceId) ?? 0) + 1);
    }
    return quantities;
  }, [view]);

  const summary = markerQuery.data?.summary;
  const fabricName = summary?.bomItemName?.trim() || summary?.name?.trim() || 'Fabric';
  const markerName = summary?.name?.trim() || `Marker ${markerId}`;
  const lengthText = formatLength(view?.result.usedLengthCm ?? 0);
  const efficiencyText = formatEfficiency(view?.result.efficiency ?? 0);
  const widthText = formatWidth(view?.widthCm ?? 0);
  const selectedPiece = view?.pieces.find((piece) => piece.id === selectedPieceId);
  const layoutSvg = useMemo(
    () =>
      view
        ? renderLayoutSvg(view.result, view.pieces, view.widthCm, view.targetCm, 0.05, {
            interactive: true,
            selectedPieceId,
            metricRulers: true,
            ariaLabel: `${widthText} centimetre fabric width, ${lengthText} marker`,
          })
        : '',
    [lengthText, selectedPieceId, view, widthText],
  );

  const selectFromMouse = (event: MouseEvent<HTMLDivElement>) => {
    const pieceId = pieceIdFromTarget(event.target);
    if (pieceId) setSelectedPieceId(pieceId);
  };
  const selectFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const pieceId = pieceIdFromTarget(event.target);
    if (!pieceId) return;
    event.preventDefault();
    setSelectedPieceId(pieceId);
  };

  const failure = !validIds
    ? 'Invalid marker'
    : markerQuery.isError
      ? 'Marker unavailable'
      : markerQuery.data && !markerBelongsToCard
        ? 'Marker mismatch'
        : undefined;

  return (
    <main className='marker-viewer-page'>
      <header className='marker-viewer-topbar'>
        <div className='marker-viewer-identity'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            Tech pack / {validIds ? techCardId : <EmptyCell />} /{' '}
            {validIds ? markerId : <EmptyCell />}
          </Text>
          <div className='marker-viewer-title-row'>
            <Text component='h1' size='large' className='font-bold uppercase tracking-section'>
              Marker viewer
            </Text>
            {summary?.isDraft && <Pill tone='attention'>Draft</Pill>}
            <Pill tone='mut'>Read only</Pill>
          </div>
        </div>
        {view && markerBelongsToCard && (
          <div
            className='marker-viewer-summary'
            aria-label={`Length ${lengthText}, efficiency ${efficiencyText}`}
          >
            <Text size='stat' component='span'>
              {lengthText}
            </Text>
            <span aria-hidden='true'>·</span>
            <Text size='stat' component='span'>
              {efficiencyText}
            </Text>
            <Button asChild variant='underline' size='xs' className='marker-viewer-edit'>
              <Link to={ROUTES.singleTechCard.replace(':id', String(techCardId))}>
                Edit in admin
              </Link>
            </Button>
          </div>
        )}
      </header>

      <div className='marker-viewer-content'>
        {markerQuery.isLoading && validIds ? (
          <SkeletonBlocks count={3} height={96} />
        ) : failure ? (
          <CalloutBox tone='error' className='marker-viewer-failure'>
            <b>{failure}</b>
            {markerQuery.isError && (
              <Button variant='underline' size='xs' onClick={() => void markerQuery.refetch()}>
                Retry
              </Button>
            )}
          </CalloutBox>
        ) : view ? (
          <>
            <Toolbar className='marker-viewer-fabrics'>
              <Chip selected pressed>
                {fabricName}
              </Chip>
              <span className='marker-viewer-fabric-rule' aria-hidden='true' />
              <HeaderNote tone='ink'>{markerName}</HeaderNote>
              {summary?.source && <HeaderNote>{summary.source}</HeaderNote>}
              <ToolbarSpacer />
              <HeaderNote tone='ink'>{widthText} cm</HeaderNote>
              <HeaderNote>{view.result.placements.length} cuts</HeaderNote>
            </Toolbar>

            <div className='marker-viewer-workspace'>
              <Section
                title={fabricName}
                question={`${widthText} cm width`}
                action={<HeaderNote>{`${lengthText} · ${efficiencyText}`}</HeaderNote>}
                className='marker-viewer-canvas'
              >
                <div
                  className='marker-viewer-pan'
                  aria-label='Marker layout'
                  onClick={selectFromMouse}
                  onKeyDown={selectFromKeyboard}
                  dangerouslySetInnerHTML={{ __html: layoutSvg }}
                />
              </Section>

              <Section
                title='Pieces'
                action={<HeaderNote>{view.result.placements.length} cuts</HeaderNote>}
                className='marker-viewer-inspector'
              >
                <div className='marker-viewer-selection' aria-live='polite'>
                  <Text size='micro' variant='label' tracking='label' className='uppercase'>
                    Selected
                  </Text>
                  <Text className='marker-viewer-selection-name'>
                    {selectedPiece?.name ?? view.pieces[0]?.name ?? <EmptyCell />}
                  </Text>
                </div>
                <div className='marker-viewer-piece-list'>
                  {view.pieces.map((piece) => {
                    const active = piece.id === selectedPieceId;
                    return (
                      <div className='marker-viewer-piece-row' key={piece.id}>
                        <Button
                          variant={active ? 'simple' : 'simpleReverse'}
                          className='marker-viewer-piece-button'
                          aria-pressed={active}
                          onClick={() => setSelectedPieceId(piece.id)}
                        >
                          <span className='marker-viewer-piece-name'>{piece.name}</span>
                          <Text
                            component='span'
                            size='nano'
                            variant='label'
                            tracking='label'
                            className='marker-viewer-piece-code'
                          >
                            {piece.blockName || piece.source || `#${piece.id}`}
                          </Text>
                        </Button>
                        <HeaderNote className='marker-viewer-piece-quantity'>
                          ×{quantityByPieceId.get(piece.id) ?? 0}
                        </HeaderNote>
                      </div>
                    );
                  })}
                  {view.pieces.length === 0 && <CalloutBox>Pieces unavailable</CalloutBox>}
                </div>
              </Section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
