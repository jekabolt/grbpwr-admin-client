import type { ElementType } from 'react';
import {
  BorderDashedIcon,
  BoxIcon,
  Button,
  CircleIcon,
  Component1Icon,
  Crosshair2Icon,
  CursorArrowIcon,
  DimensionsIcon,
  DrawingPinIcon,
  EnterFullScreenIcon,
  EyeOpenIcon,
  FileTextIcon,
  HandIcon,
  LayersIcon,
  MagicWandIcon,
  MinusIcon,
  Pencil1Icon,
  PlusIcon,
  RulerHorizontalIcon,
  RulerSquareIcon,
  ScissorsIcon,
  SewingPinIcon,
  TargetIcon,
  ValueIcon,
} from 'ui';

export type PatternImportDxfPhaseECadWorkbenchIconV1 =
  | 'select'
  | 'hand'
  | 'move'
  | 'fit'
  | 'reset-layout'
  | 'connect'
  | 'measure-point'
  | 'measure-line'
  | 'measure-edge'
  | 'callout'
  | 'evidence'
  | 'view-options'
  | 'pen'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'add-point'
  | 'move-point'
  | 'delete-point'
  | 'sharpen-corner'
  | 'internal-line'
  | 'french-curve'
  | 'draft-point'
  | 'guideline'
  | 'pattern-line'
  | 'point-only'
  | 'dart'
  | 'fish-eye'
  | 'spread'
  | 'gather'
  | 'pleat'
  | 'cut'
  | 'notch'
  | 'mark';

const ICONS: Readonly<Record<PatternImportDxfPhaseECadWorkbenchIconV1, ElementType>> =
  Object.freeze({
    select: CursorArrowIcon,
    hand: HandIcon,
    move: DimensionsIcon,
    fit: EnterFullScreenIcon,
    'reset-layout': LayersIcon,
    connect: SewingPinIcon,
    'measure-point': TargetIcon,
    'measure-line': RulerHorizontalIcon,
    'measure-edge': RulerSquareIcon,
    callout: FileTextIcon,
    evidence: EyeOpenIcon,
    'view-options': LayersIcon,
    pen: Pencil1Icon,
    rectangle: BoxIcon,
    circle: CircleIcon,
    ellipse: CircleIcon,
    'add-point': PlusIcon,
    'move-point': Crosshair2Icon,
    'delete-point': MinusIcon,
    'sharpen-corner': RulerSquareIcon,
    'internal-line': RulerHorizontalIcon,
    'french-curve': MagicWandIcon,
    'draft-point': Crosshair2Icon,
    guideline: BorderDashedIcon,
    'pattern-line': Component1Icon,
    'point-only': TargetIcon,
    dart: SewingPinIcon,
    'fish-eye': ValueIcon,
    spread: DimensionsIcon,
    gather: Component1Icon,
    pleat: LayersIcon,
    cut: ScissorsIcon,
    notch: SewingPinIcon,
    mark: DrawingPinIcon,
  });

export function PatternImportDxfPhaseECadWorkbenchToolButtonV1({
  icon,
  label,
  active = false,
  pressed,
  expanded,
  disabled = false,
  onClick,
  dataAttributes,
}: Readonly<{
  icon: PatternImportDxfPhaseECadWorkbenchIconV1;
  label: string;
  active?: boolean;
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
  dataAttributes?: Readonly<Record<string, string>>;
}>) {
  const Icon = ICONS[icon];
  return (
    <Button
      type='button'
      size='xs'
      variant='default'
      className={`flex h-10 w-10 flex-none items-center justify-center p-0 ${
        active ? 'bg-textColor text-bgColor' : 'hover:bg-pageBg'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      {...dataAttributes}
    >
      <Icon aria-hidden width='16' height='16' />
      <span className='sr-only'>{label}</span>
    </Button>
  );
}
