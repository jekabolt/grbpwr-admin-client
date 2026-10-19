import { useState } from 'react';
import { Button, Chip, ChipRow, CopyToClipboard, useDoneFlash, ViewSwitch } from 'ui';
import { addDoorDemo } from './add-door';
import { backLinkDemo } from './back-link';
import { closeDemo } from './close';
import { undoRowDemo } from './undo-row';
import { KitDemo, KitLines, KitMatrix } from './kit-entry';

const SIZES = ['xs', 'sm', 'default', 'lg'] as const;
const VARIANTS = [
  'main',
  'secondary',
  'underline',
  'default',
  'simple',
  'simpleReverse',
  'simpleReverseWithBorder',
  'underlineReverse',
  'underlineWithColors',
  'strikeThrough',
] as const;

function ButtonDemo() {
  return (
    <KitMatrix
      cols={[...SIZES]}
      labelWidth={170}
      rows={[
        ...VARIANTS.map((variant) => ({
          label: variant,
          cells: SIZES.map((size) =>
            // White-on-white otherwise: the reverse variant is drawn for dark ground.
            variant === 'underlineReverse' ? (
              <span className='bg-textColor p-1'>
                <Button variant={variant} size={size}>
                  edit
                </Button>
              </span>
            ) : (
              <Button variant={variant} size={size}>
                {variant === 'underline' ? '+ add' : 'save'}
              </Button>
            ),
          ),
        })),
        {
          label: 'main disabled',
          cells: SIZES.map((size) => (
            <Button variant='main' size={size} disabled>
              save
            </Button>
          )),
        },
        {
          label: 'secondary disabled',
          cells: SIZES.map((size) => (
            <Button variant='secondary' size={size} disabled>
              cancel
            </Button>
          )),
        },
        {
          label: 'main loading',
          cells: SIZES.map((size) => (
            <Button variant='main' size={size} loading>
              save
            </Button>
          )),
        },
        {
          label: 'main done',
          cells: SIZES.map((size) => (
            <Button variant='main' size={size} done>
              save
            </Button>
          )),
        },
        {
          label: 'secondary done',
          cells: SIZES.map((size) => (
            <Button variant='secondary' size={size} done='published'>
              publish
            </Button>
          )),
        },
        { label: 'main flash', cells: SIZES.map((size) => <FlashSave key={size} size={size} />) },
      ]}
    />
  );
}

/** Click: a short fake save, then `saved ✓` for 1.5 s. */
function FlashSave({ size }: { size: (typeof SIZES)[number] }) {
  const done = useDoneFlash();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 400));
    setBusy(false);
    done.flash();
  };
  return (
    <Button variant='main' size={size} loading={busy} done={done.on} onClick={save}>
      save
    </Button>
  );
}

function ChipDemo() {
  const [on, setOn] = useState(true);
  const tones = ['default', 'error', 'attention'] as const;
  return (
    <KitMatrix
      cols={['off', 'on', 'dashed', 'quiet', 'disabled']}
      rows={[
        ...tones.map((tone) => ({
          label: tone,
          cells: [
            <Chip tone={tone} onClick={() => undefined}>
              open
            </Chip>,
            <Chip tone={tone} selected onClick={() => undefined}>
              all
            </Chip>,
            <Chip tone={tone} dashed onClick={() => undefined}>
              + add
            </Chip>,
            <Chip tone={tone} quiet onClick={() => undefined}>
              done
            </Chip>,
            <Chip tone={tone} disabled onClick={() => undefined}>
              off
            </Chip>,
          ],
        })),
        {
          label: 'row',
          cells: [
            <ChipRow>
              <Chip selected={on} pressed={on} onClick={() => setOn(!on)}>
                toggle
              </Chip>
              <Chip onRemove={() => undefined}>wool</Chip>
              <Chip>static</Chip>
            </ChipRow>,
          ],
        },
      ]}
    />
  );
}

function ViewSwitchDemo() {
  const [view, setView] = useState<'tiles' | 'table' | 'board'>('tiles');
  const options = [
    { value: 'tiles' as const, label: 'tiles' },
    { value: 'table' as const, label: 'table' },
    { value: 'board' as const, label: 'board', disabled: true },
  ];
  return (
    <KitLines
      lines={[
        {
          label: 'default',
          content: <ViewSwitch label='view' value={view} options={options} onChange={setView} />,
        },
        {
          label: 'quiet',
          content: (
            <ViewSwitch label='view' value={view} options={options} onChange={setView} quiet />
          ),
        },
        {
          label: 'disabled',
          content: (
            <ViewSwitch label='view' value={view} options={options} onChange={setView} disabled />
          ),
        },
      ]}
    />
  );
}

function CopyDemo() {
  return (
    <KitLines
      lines={[
        { label: 'full', content: <CopyToClipboard text='S-0142' /> },
        { label: 'cut', content: <CopyToClipboard text='a1b2c3d4e5f6g7h8' cutText /> },
      ]}
    />
  );
}

export const actionDemos: KitDemo[] = [
  { names: ['Button'], Demo: ButtonDemo },
  backLinkDemo,
  addDoorDemo,
  closeDemo,
  undoRowDemo,
  { names: ['Chip', 'ChipRow'], Demo: ChipDemo },
  { names: ['ViewSwitch'], Demo: ViewSwitchDemo },
  { names: ['CopyToClipboard'], Demo: CopyDemo },
];
