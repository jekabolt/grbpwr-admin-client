import { useState } from 'react';
import { Button, ConfirmationModal, Drawer, GenericPopover, Row, Text, Tooltip } from 'ui';
import { KitDemo, KitLines } from './kit-entry';

// Both shells portal into document.body (Radix Dialog), so they cannot render inline: trigger only.
function ConfirmationModalDemo() {
  const [width, setWidth] = useState<'sm' | 'md' | 'lg' | null>(null);
  return (
    <>
      <KitLines
        lines={(['sm', 'md', 'lg'] as const).map((w) => ({
          label: w,
          content: (
            <Button variant='secondary' size='sm' onClick={() => setWidth(w)}>
              open
            </Button>
          ),
        }))}
      />
      <ConfirmationModal
        open={width !== null}
        onOpenChange={(o) => !o && setWidth(null)}
        onConfirm={() => undefined}
        title='delete sample'
        confirmLabel='delete'
        width={width ?? 'md'}
      >
        <Text>S-0142 · wool coat</Text>
      </ConfirmationModal>
    </>
  );
}

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant='secondary' size='sm' onClick={() => setOpen(true)}>
        open
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title='sample'
        footer={
          <Button variant='main' size='sm' onClick={() => setOpen(false)}>
            save
          </Button>
        }
      >
        <Row label='code' value='S-0142' />
        <Row label='fabric' value='wool 420' />
      </Drawer>
    </>
  );
}

function PopoverDemo() {
  return (
    <KitLines
      lines={[
        {
          label: 'titled',
          content: (
            <GenericPopover
              title='filters'
              openElement={<span className='underline'>open</span>}
            >
              <Row label='fabric' value='wool' />
            </GenericPopover>
          ),
        },
        {
          label: 'no tail',
          content: (
            <GenericPopover noTail openElement={<span className='underline'>open</span>}>
              <Row label='fabric' value='cupro' />
            </GenericPopover>
          ),
        },
      ]}
    />
  );
}

function TooltipDemo() {
  return (
    <KitLines
      lines={(['top', 'right', 'bottom'] as const).map((side) => ({
        label: side,
        content: (
          <Tooltip side={side} trigger={<span className='underline' tabIndex={0}>hover</span>}>
            wool 420
          </Tooltip>
        ),
      }))}
    />
  );
}

export const overlayDemos: KitDemo[] = [
  { names: ['ConfirmationModal'], Demo: ConfirmationModalDemo },
  { names: ['Drawer'], Demo: DrawerDemo },
  { names: ['GenericPopover', 'PopoverContent'], Demo: PopoverDemo },
  { names: ['Tooltip', 'TooltipProvider'], Demo: TooltipDemo },
];
