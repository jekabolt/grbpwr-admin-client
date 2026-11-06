import { useQuery } from '@tanstack/react-query';
import { filesService } from 'components/managers/files/api/filesService';
import { filesKeys } from 'components/managers/files/hooks/useFiles';
import { extensionOf } from 'components/managers/files/utils/format';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { CARE_ARTWORK } from 'components/managers/product/components/care/care-artwork';
import { cn } from 'lib/utility';
import type { JSX, ReactNode } from 'react';
import { Button, Close, EmptyCell, GrbpwrMark, Media, Placeholder, Text } from 'ui';
import type { CareLabelColorway, CareLabelData, CareLabelSize } from '../../care-labels/adapter';
import type { PartComposition } from '../../care-labels/composition-resolver';
import type { ArtworkFile } from '../sewn-label-model';
import { wireInt } from '../wire-int';
import type { ArtworkChoice } from './composition-artwork-model';
import { addressLines } from './label-summary';

export type LabelOrientation = 'vertical' | 'horizontal';

export type CompositionPreviewData = {
  colorway: CareLabelColorway | undefined;
  size: CareLabelSize | undefined;
  parts: readonly PartComposition[];
};

function previewFileName(file: ArtworkFile | undefined): string {
  if (!file) return '';
  return `file ${wireInt(file.libraryFileId)}`;
}

function OwnFilePreview({
  file,
  orientation,
  canEdit,
  showFileActions,
  onChoose,
  onClear,
}: {
  file: ArtworkFile | undefined;
  orientation: LabelOrientation;
  canEdit: boolean;
  showFileActions: boolean;
  onChoose: () => void;
  onClear: () => void;
}): JSX.Element {
  const id = wireInt(file?.libraryFileId);
  const query = useQuery({
    queryKey: filesKeys.file(id),
    queryFn: () => filesService.getFile(id),
    enabled: id > 0,
    staleTime: 30 * 60 * 1000,
  });
  const info = query.data?.file;
  const name = info?.fileName || previewFileName(file);
  const url = file?.publicUrl?.trim() ?? '';
  const shape =
    orientation === 'horizontal'
      ? 'h-36 w-full max-w-sm'
      : 'h-80 w-full max-w-44 max-sm:h-72 max-sm:max-w-36';

  if (!file) {
    return (
      <Button type='button' disabled={!canEdit} onClick={onChoose} className={cn(shape, 'block')}>
        <Placeholder dashed label='+ File' className='h-full w-full' />
      </Button>
    );
  }

  return (
    <div className={cn(shape, 'flex flex-col border border-borderColor bg-bgColor')}>
      <Button
        type='button'
        disabled={!url}
        onClick={() => window.open(publicFilePageUrl(url) || url, '_blank', 'noopener')}
        className='flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-pageBg disabled:cursor-default'
      >
        {info?.previewUrl ? (
          <Media src={info.previewUrl} alt='' aspectRatio='auto' fit='contain' />
        ) : (
          <Text size='micro' variant='label' component='span' className='uppercase'>
            {name ? extensionOf(name) : 'file'}
          </Text>
        )}
      </Button>
      <div className='flex h-7 shrink-0 items-center border-t border-borderColor pl-2.5'>
        {showFileActions ? (
          <>
            <Button
              type='button'
              variant='underline'
              size='xs'
              disabled={!canEdit}
              onClick={onChoose}
              className='min-w-0 flex-1 truncate text-left'
            >
              {name || 'Change file'}
            </Button>
            <Close
              size='sm'
              disabled={!canEdit}
              aria-label='remove file'
              onClick={onClear}
              className='h-7 w-7 border-l border-borderColor'
            />
          </>
        ) : (
          <Text component='span' size='micro' variant='label' className='truncate uppercase'>
            {name || 'Own file'}
          </Text>
        )}
      </div>
    </div>
  );
}

function RibbonFace({
  data,
  colorway,
  size,
  logoUrl,
  orientation,
}: {
  data: CareLabelData;
  colorway: CareLabelColorway;
  size: CareLabelSize | undefined;
  logoUrl: string;
  orientation: LabelOrientation;
}): JSX.Element {
  return (
    <RibbonShell caption='Face' orientation={orientation}>
      {logoUrl ? (
        <img src={logoUrl} alt='label logo' className='max-h-8 max-w-24 object-contain' />
      ) : (
        <GrbpwrMark className='h-7 w-24' />
      )}
      <Text component='span' size='statBig' className='font-bold uppercase'>
        {size?.label || 'Size'}
      </Text>
      <span className='w-full border-t border-hairline' />
      <Text component='span' size='nano' className='w-full text-center uppercase'>
        {colorway.colourName || data.styleName}
      </Text>
      <Text component='span' size='nano' variant='label' className='w-full text-center uppercase'>
        {colorway.baseSku || data.styleNumber}
      </Text>
      <span className='w-full border-t border-hairline' />
      <Text component='span' size='nano' className='w-full text-center uppercase'>
        {addressLines(data).join(' · ')}
      </Text>
    </RibbonShell>
  );
}

function RibbonBack({
  data,
  colorway,
  parts,
  orientation,
}: {
  data: CareLabelData;
  colorway: CareLabelColorway;
  parts: readonly PartComposition[];
  orientation: LabelOrientation;
}): JSX.Element {
  return (
    <RibbonShell caption='Back' orientation={orientation}>
      <span className='flex w-full flex-col gap-1.5'>
        {parts
          .filter((part) => part.part !== 'NOTE')
          .map((part) => (
            <span key={part.part} className='flex flex-col text-center uppercase'>
              <Text component='span' size='nano' variant='label'>
                {part.part.replaceAll('_', ' ')}
              </Text>
              <Text component='span' size='nano'>
                {part.fibers.map((fiber) => `${fiber.percent}% ${fiber.code}`).join(' · ')}
              </Text>
            </span>
          ))}
      </span>
      <span className='w-full border-t border-hairline' />
      <span className='flex flex-wrap justify-center gap-1'>
        {data.care.codes.map((code) =>
          CARE_ARTWORK[code] ? (
            <img
              key={code}
              src={CARE_ARTWORK[code]}
              alt={code}
              className='h-4 w-4 object-contain'
            />
          ) : (
            <Text key={code} component='span' size='nano' variant='label'>
              {code}
            </Text>
          ),
        )}
      </span>
      <Text
        component='span'
        size='nano'
        variant={colorway.countryName ? 'default' : 'errorLabel'}
        className='w-full text-center uppercase'
      >
        Made in {colorway.countryName || <EmptyCell />}
      </Text>
    </RibbonShell>
  );
}

function RibbonShell({
  caption,
  orientation,
  children,
}: {
  caption: string;
  orientation: LabelOrientation;
  children: ReactNode;
}): JSX.Element {
  const horizontal = orientation === 'horizontal';
  return (
    <figure className='m-0 flex min-w-0 flex-col items-center gap-1'>
      <figcaption className='text-micro uppercase tracking-label text-labelColor'>
        {caption}
      </figcaption>
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 overflow-hidden border border-borderColor bg-pageBg p-3 text-center',
          horizontal ? 'h-36 w-full pr-6' : 'min-h-80 w-full px-2.5 py-4 max-sm:min-h-72',
        )}
        style={
          horizontal
            ? {
                clipPath:
                  'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)',
              }
            : undefined
        }
      >
        {children}
      </div>
    </figure>
  );
}

export function CompositionLabelPreview({
  data,
  preview,
  logoUrl,
  choice,
  file,
  orientation,
  canEdit,
  showFileActions = true,
  onChooseFile,
  onClearFile,
}: {
  data: CareLabelData | null;
  preview: CompositionPreviewData;
  logoUrl: string;
  choice: ArtworkChoice;
  file: ArtworkFile | undefined;
  orientation: LabelOrientation;
  canEdit: boolean;
  showFileActions?: boolean;
  onChooseFile: () => void;
  onClearFile: () => void;
}): JSX.Element {
  if (choice !== 'built') {
    return (
      <OwnFilePreview
        file={file}
        orientation={orientation}
        canEdit={canEdit}
        showFileActions={showFileActions}
        onChoose={onChooseFile}
        onClear={onClearFile}
      />
    );
  }

  if (!data || !preview.colorway) {
    return <Placeholder label='No preview' className='h-36 w-full max-w-sm' />;
  }

  return (
    <div
      className={cn(
        'grid w-full items-start gap-2.5',
        orientation === 'horizontal' ? 'max-w-sm grid-cols-1' : 'max-w-sm grid-cols-2',
      )}
      data-composition-ribbons=''
    >
      <RibbonFace
        data={data}
        colorway={preview.colorway}
        size={preview.size}
        logoUrl={logoUrl}
        orientation={orientation}
      />
      <RibbonBack
        data={data}
        colorway={preview.colorway}
        parts={preview.parts}
        orientation={orientation}
      />
    </div>
  );
}
