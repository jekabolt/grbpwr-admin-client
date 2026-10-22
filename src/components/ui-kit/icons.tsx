import { MeasurementPictogram } from 'components/managers/model/components/measurement-pictograms';
import {
  GARMENT_PARTS,
  PartPictogram,
} from 'components/managers/tech-card/components/design/garment-parts';
import {
  GARMENT_FAMILIES,
  GarmentPictogram,
  PictogramBackdrop,
  UNDRAWN_FAMILIES,
} from 'components/managers/tech-card/components/design/garment-pictograms';
import {
  HARDWARE_KINDS,
  HardwareIcon,
  LABEL_KINDS,
  LabelIcon,
} from 'components/managers/tech-card/components/design/hardware-icons';
import {
  TrimPictogram,
  type TrimPictogramKind,
} from 'components/managers/tech-card/components/design/pattern/trim-pictograms';
import {
  PaletteIcon,
  SEAM_KINDS,
  SeamIcon,
} from 'components/managers/tech-card/components/design/seam-icons';
import {
  ACCENT_FILL_OPACITY,
  BACKDROP_OPACITY,
  DASH,
  GHOST_OPACITY,
  Glyph,
  LINE,
  LINE_BOLD,
  LINE_EMPHASIS,
  LINE_HAIRLINE,
  type GlyphName,
} from 'ui';
import { KitDemo, KitLabel, KitLines, KitMatrix } from './kit-entry';

const GLYPHS: GlyphName[] = ['photo', 'model', 'pen', 'sparkle'];

/** One icon over its micro caption. */
function Cell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className='flex min-w-0 flex-col items-center gap-1'>
      {children}
      <KitLabel>{name}</KitLabel>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className='flex flex-wrap items-end gap-4'>{children}</div>;
}

function GlyphDemo() {
  return (
    <KitMatrix
      cols={GLYPHS}
      rows={[
        { label: '20', cells: GLYPHS.map((g) => <Glyph name={g} />) },
        { label: '40', cells: GLYPHS.map((g) => <Glyph name={g} className='size-10' />) },
      ]}
    />
  );
}

/** A 24-grid sample swatch for one line constant. */
function Swatch({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden viewBox='0 0 24 24' className='size-10'>
      {children}
    </svg>
  );
}

function LineDemo() {
  const weights: [string, number][] = [
    ['LINE_HAIRLINE', LINE_HAIRLINE],
    ['LINE', LINE.strokeWidth],
    ['LINE_EMPHASIS', LINE_EMPHASIS],
    ['LINE_BOLD', LINE_BOLD],
  ];
  return (
    <KitLines
      lines={[
        {
          label: 'weight',
          content: (
            <Grid>
              {weights.map(([name, w]) => (
                <Cell key={name} name={name}>
                  <Swatch>
                    <path {...LINE} strokeWidth={w} d='M3 12h18' />
                  </Swatch>
                </Cell>
              ))}
            </Grid>
          ),
        },
        {
          label: 'tone',
          content: (
            <Grid>
              <Cell name='ACCENT_FILL'>
                <Swatch>
                  <rect
                    {...LINE}
                    x='4'
                    y='4'
                    width='16'
                    height='16'
                    fill='currentColor'
                    fillOpacity={ACCENT_FILL_OPACITY}
                  />
                </Swatch>
              </Cell>
              <Cell name='GHOST'>
                <Swatch>
                  <rect {...LINE} x='4' y='4' width='16' height='16' opacity={GHOST_OPACITY} />
                </Swatch>
              </Cell>
              <Cell name='BACKDROP'>
                <Swatch>
                  <rect {...LINE} x='4' y='4' width='16' height='16' opacity={BACKDROP_OPACITY} />
                </Swatch>
              </Cell>
              <Cell name='DASH'>
                <Swatch>
                  <rect {...LINE} x='4' y='4' width='16' height='16' strokeDasharray={DASH} />
                </Swatch>
              </Cell>
            </Grid>
          ),
        },
      ]}
    />
  );
}

const MEASUREMENTS = [
  'CHEST',
  'UNDER_BUST',
  'WAIST',
  'HIGH_HIP',
  'HIP',
  'NECK_BASE',
  'ACROSS_SHOULDER',
  'SLEEVE_LENGTH',
  'BICEP',
  'WRIST',
  'INSEAM',
  'THIGH',
  'KNEE',
  'CALF',
  'ANKLE',
  'HEIGHT',
  'HPS_TO_WAIST_FRONT',
  'CB_NECK_TO_WAIST',
  'ACROSS_FRONT',
  'ACROSS_BACK',
];

function MeasurementDemo() {
  return (
    <Grid>
      {MEASUREMENTS.map((m) => (
        <Cell key={m} name={m.toLowerCase().replace(/_/g, ' ')}>
          <MeasurementPictogram
            measurementName={`BODY_MEASUREMENT_NAME_${m}`}
            className='h-24 w-16'
          />
        </Cell>
      ))}
    </Grid>
  );
}

const FAMILIES = GARMENT_FAMILIES.filter((f) => !UNDRAWN_FAMILIES.includes(f)).slice(0, 6);

function GarmentDemo() {
  return (
    <KitLines
      lines={[
        ...(['front', 'back'] as const).map((view) => ({
          label: view,
          content: (
            <Grid>
              {FAMILIES.map((f) => (
                <Cell key={f} name={f}>
                  <GarmentPictogram family={f} view={view} className='h-24 w-16' />
                </Cell>
              ))}
            </Grid>
          ),
        })),
        {
          label: 'backdrop',
          content: (
            <Grid>
              {FAMILIES.slice(0, 3).map((f) => (
                <Cell key={f} name={f}>
                  <div className='relative h-36 w-24 border border-borderColor'>
                    <PictogramBackdrop family={f} view='front' />
                  </div>
                </Cell>
              ))}
            </Grid>
          ),
        },
      ]}
    />
  );
}

const TRIM_KINDS: TrimPictogramKind[] = [
  'fabric',
  'button',
  'zipper',
  'zipper-pull',
  'label',
  'snap',
  'buckle',
  'eyelet',
  'cord',
  'velcro',
  'rivet',
  'packaging',
  'artwork',
  'generic',
];

function TrimDemo() {
  return (
    <Grid>
      {TRIM_KINDS.map((k) => (
        <Cell key={k} name={k}>
          <TrimPictogram kind={k} className='size-16' />
        </Cell>
      ))}
    </Grid>
  );
}

function HardwareDemo() {
  return (
    <KitLines
      lines={[
        {
          label: 'hardware',
          content: (
            <Grid>
              {HARDWARE_KINDS.map((k) => (
                <Cell key={k} name={k.replace(/^hw_/, '')}>
                  <HardwareIcon kind={k} size={48} />
                </Cell>
              ))}
            </Grid>
          ),
        },
        {
          label: 'label',
          content: (
            <Grid>
              {LABEL_KINDS.map((k) => (
                <Cell key={k} name={k.replace(/^lbl_/, '')}>
                  <LabelIcon kind={k} size={48} />
                </Cell>
              ))}
            </Grid>
          ),
        },
      ]}
    />
  );
}

function SeamDemo() {
  return (
    <Grid>
      {SEAM_KINDS.map((k) => (
        <Cell key={k} name={k.replace(/^sm_/, '')}>
          <SeamIcon kind={k} size={48} />
        </Cell>
      ))}
      <Cell name='palette'>
        <PaletteIcon size={48} />
      </Cell>
    </Grid>
  );
}

const PART_FAMILY = FAMILIES[0];
const PART_KEYS = Object.keys(GARMENT_PARTS[PART_FAMILY] ?? {}).slice(0, 6);

function PartDemo() {
  return (
    <Grid>
      {PART_KEYS.map((p) => (
        <Cell key={p} name={p}>
          <PartPictogram family={PART_FAMILY} part={p} className='h-24 w-16' />
        </Cell>
      ))}
    </Grid>
  );
}

const FEATURE = 'components/managers';

export const iconDemos: KitDemo[] = [
  { names: ['Glyph'], Demo: GlyphDemo, keywords: ['icon', 'placeholder', 'photo', 'pen'] },
  {
    names: ['line'],
    Demo: LineDemo,
    question: "import { LINE, … } from 'ui'",
    keywords: ['stroke', 'icon style', 'dash', 'ghost', 'backdrop'],
  },
  {
    names: ['measurement-pictogram'],
    title: 'MeasurementPictogram',
    Demo: MeasurementDemo,
    question: `${FEATURE}/model/components/measurement-pictograms`,
    keywords: ['measurement', 'body', 'mannequin'],
  },
  {
    names: ['garment-pictogram'],
    title: 'GarmentPictogram',
    Demo: GarmentDemo,
    question: `${FEATURE}/tech-card/components/design/garment-pictograms`,
    keywords: ['garment', 'PictogramBackdrop', 'silhouette'],
  },
  {
    names: ['trim-pictogram'],
    title: 'TrimPictogram',
    Demo: TrimDemo,
    question: `${FEATURE}/tech-card/components/design/pattern/trim-pictograms`,
    keywords: ['trim', 'bom'],
  },
  {
    names: ['hardware-icon'],
    title: 'HardwareIcon',
    Demo: HardwareDemo,
    question: `${FEATURE}/tech-card/components/design/hardware-icons`,
    keywords: ['hardware', 'LabelIcon', 'label'],
  },
  {
    names: ['seam-icon'],
    title: 'SeamIcon',
    Demo: SeamDemo,
    question: `${FEATURE}/tech-card/components/design/seam-icons`,
    keywords: ['seam', 'PaletteIcon', 'palette'],
  },
  {
    names: ['part-pictogram'],
    title: 'PartPictogram',
    Demo: PartDemo,
    question: `${FEATURE}/tech-card/components/design/garment-parts`,
    keywords: ['part', 'garment part'],
  },
];
