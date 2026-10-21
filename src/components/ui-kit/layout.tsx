import { useState } from 'react';
import {
  Accordion,
  Board,
  BoardCard,
  BoardColumn,
  BoardEmpty,
  Button,
  Chip,
  FoldCaret,
  GroupLabel,
  HeaderCount,
  HeaderNext,
  HeaderNote,
  Placeholder,
  Row,
  RowTotal,
  Section,
  SectionHeader,
  SectionStack,
  SideRail,
  SideRailGroup,
  SideRailItem,
  SideRailLayout,
  Text,
  Tile,
  Tiles,
  Toolbar,
  ToolbarSpacer,
} from 'ui';
import { KitDemo, KitLines } from './kit-entry';

function SectionDemo() {
  return (
    <div className='bg-pageBg p-block'>
      <SectionStack>
        <Section
          title='materials'
          question='shell · lining'
          action={
            <Button variant='underline' size='xs'>
              edit
            </Button>
          }
        >
          <GroupLabel flush>shell</GroupLabel>
          <Row label='fabric' value='wool 80% / pa 20%' />
          <Row label='weight' value='420 g/m²' />
          <GroupLabel>lining</GroupLabel>
          <Row label='fabric' value='cupro' />
        </Section>
        <Section title='history' collapsible defaultOpen={false}>
          <Row label='hidden' value='—' />
        </Section>
      </SectionStack>
    </div>
  );
}

function SectionHeaderDemo() {
  return (
    <div className='flex flex-col gap-stack'>
      <SectionHeader title='samples' question='what is late' />
      <SectionHeader
        title='runs'
        action={
          <>
            <HeaderCount n={3} noun='run' total={5} />
            <HeaderNote tone='warn'>2 late</HeaderNote>
            <HeaderNote tone='ok'>ready</HeaderNote>
          </>
        }
      />
      <SectionHeader title='fittings' action={<HeaderNext label='fit 2' />} />
    </div>
  );
}

function RowDemo() {
  return (
    <div>
      <Row label='wool 420' value='€ 58.80' />
      <Row label='cupro' value='€ 14.40' />
      <Row label='label' value='—' tone='label' />
      <Row label='trims' value='missing' tone='error' />
      <RowTotal label='total' value='€ 73.20' />
    </div>
  );
}

function GroupLabelDemo() {
  return (
    <div>
      <GroupLabel flush>shell</GroupLabel>
      <GroupLabel
        lead={<Chip selected>3</Chip>}
        action={
          <Button variant='underline' size='xs'>
            + add
          </Button>
        }
      >
        trims
      </GroupLabel>
      <GroupLabel
        rule='above'
        plain
        swatch={<span aria-hidden className='size-5 border border-borderColor bg-pageBg' />}
      >
        shell fabric <span className='text-labelColor'>· m · FAB-1785514792</span>
      </GroupLabel>
    </div>
  );
}

function AccordionDemo() {
  return (
    <div className='flex flex-col gap-stack'>
      <Accordion title='open' meta='3 items' defaultOpen>
        <Row label='fabric' value='wool' />
      </Accordion>
      <Accordion title='closed' meta='2 items'>
        <Row label='fabric' value='cupro' />
      </Accordion>
      <Accordion title='error' tone='error' meta='1 issue'>
        <Row label='trims' value='missing' tone='error' />
      </Accordion>
    </div>
  );
}

function ToolbarDemo() {
  return (
    <div className='flex flex-col gap-stack'>
      <Toolbar>
        <Chip selected>all</Chip>
        <Chip>open</Chip>
        <ToolbarSpacer />
        <Button variant='main' size='sm'>
          + new
        </Button>
      </Toolbar>
      <Toolbar sticky>
        <Text size='micro' variant='label'>
          sticky
        </Text>
      </Toolbar>
    </div>
  );
}

function SideRailDemo() {
  const [selected, setSelected] = useState('design');
  return (
    <SideRailLayout
      rail={
        <SideRail width={180}>
          <SideRailGroup flush>boards</SideRailGroup>
          {[
            { label: 'development', count: 12, done: true },
            { label: 'design', count: 7, done: false },
            { label: 'marketing', count: 2, done: false },
          ].map((item) => (
            <SideRailItem
              key={item.label}
              label={item.label}
              count={item.count}
              done={item.done}
              selected={selected === item.label}
              onClick={() => setSelected(item.label)}
            />
          ))}
        </SideRail>
      }
    >
      <Placeholder label={selected} className='h-32' />
    </SideRailLayout>
  );
}

function TilesDemo() {
  return (
    <Tiles min={120}>
      <Tile media={<Placeholder aspect='square' />} name='default' sub='S-0142' />
      <Tile media={<Placeholder aspect='square' />} name='selected' sub='S-0143' selected />
      <Tile media={<Placeholder aspect='square' dashed />} name='dashed' sub='empty' dashed />
      <Tile media={<Placeholder aspect='square' tone='error' />} name='error' tone='error' />
      <Tile media={<Placeholder aspect='square' />} name='clickable' onClick={() => undefined} />
    </Tiles>
  );
}

function BoardDemo() {
  return (
    <Board>
      <BoardColumn title='todo' count={2} width={220}>
        <BoardCard onClick={() => undefined}>wool coat</BoardCard>
        <BoardCard dimmed>blocked</BoardCard>
      </BoardColumn>
      <BoardColumn title='doing' count={1} width={220} isDropTarget>
        <BoardCard>cupro lining</BoardCard>
      </BoardColumn>
      <BoardColumn title='done' count={0} width={220}>
        <BoardEmpty onClick={() => undefined}>+ add</BoardEmpty>
      </BoardColumn>
    </Board>
  );
}

function FoldCaretDemo() {
  return (
    <KitLines
      lines={[
        { label: 'folded', content: <FoldCaret open={false} /> },
        { label: 'open', content: <FoldCaret open /> },
      ]}
    />
  );
}

function TextDemo() {
  const variants = [
    'default',
    'label',
    'inactive',
    'uppercase',
    'underlined',
    'underLineWithColor',
    'strikethrough',
    'strileTroughInactive',
    'error',
    'errorLabel',
    'selected',
  ] as const;
  const sizes = ['statBig', 'large', 'stat', 'default', 'control', 'micro', 'nano'] as const;
  return (
    <div className='grid grid-cols-1 gap-gutter lg:grid-cols-2'>
      <KitLines
        lines={variants.map((v) => ({
          label: v,
          content: (
            <Text variant={v} component='span'>
              wool coat
            </Text>
          ),
        }))}
        labelWidth={150}
      />
      <KitLines
        lines={sizes.map((s) => ({
          label: s,
          content: (
            <Text size={s} component='span'>
              wool coat
            </Text>
          ),
        }))}
      />
    </div>
  );
}

export const layoutDemos: KitDemo[] = [
  { names: ['Section', 'SectionStack'], Demo: SectionDemo },
  { names: ['SectionHeader', 'HeaderNote', 'HeaderCount', 'HeaderNext'], Demo: SectionHeaderDemo },
  { names: ['Row', 'RowTotal'], Demo: RowDemo },
  { names: ['GroupLabel'], Demo: GroupLabelDemo },
  { names: ['Text'], Demo: TextDemo },
  { names: ['Accordion'], Demo: AccordionDemo },
  { names: ['Toolbar', 'ToolbarSpacer'], Demo: ToolbarDemo },
  { names: ['SideRail', 'SideRailLayout', 'SideRailGroup', 'SideRailItem'], Demo: SideRailDemo },
  { names: ['Tiles', 'Tile'], Demo: TilesDemo },
  { names: ['Board', 'BoardColumn', 'BoardCard', 'BoardEmpty'], Demo: BoardDemo },
  { names: ['FoldCaret'], Demo: FoldCaretDemo },
];
