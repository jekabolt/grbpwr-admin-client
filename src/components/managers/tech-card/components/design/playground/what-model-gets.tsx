import type { JSX } from 'react';
import Text from 'ui/components/text';

import { InventoryLine, NotSent, WmgGroup, WmgShell } from '../core';
import type { Inventory } from './registry/types';

/**
 * ═══ WHAT THE MODEL GETS — PLAYGROUND (C-03) ══════════════════════════════════════════════════════
 *
 * THE ONE SURFACE ON WHICH IT IS VISIBLE WHAT A PRESS OF GENERATE BUYS. Each workflow describes its
 * own request (`def.run.inventory`), and it describes the REQUEST — the object `wire()` built — not
 * the form: a second reconstruction of the body is a second statement about one paid run, and the
 * two disagree silently (the defect this modal exists against cost a week on a neighbouring screen).
 *
 * This file only draws: the groups in the order the workflow gives them, then NOT SENT with a
 * reason per line — the half that is easiest to be wrong about.
 */
export function WhatModelGetsPlaygroundModal({
  open,
  onOpenChange,
  inventory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` while closed — the inventory is computed only when someone looks. */
  inventory: Inventory | null;
}): JSX.Element {
  return (
    <WmgShell
      open={open && !!inventory}
      onOpenChange={onOpenChange}
      kindWord={inventory?.kindWord ?? 'playground'}
      intro={inventory?.intro ?? ''}
    >
      {inventory?.groups.map((group) => (
        <WmgGroup
          key={group.key}
          label={group.label}
          aside={group.aside}
          note={group.note}
          flush={!!group.lines?.length}
          data-wmg-group={group.key}
        >
          {group.lines?.map((line) => (
            <InventoryLine
              key={line.key}
              number={line.number}
              thumb={line.thumb}
              name={line.name}
              origin={line.thumb !== undefined ? 'linked' : undefined}
              text={line.text}
            />
          ))}
          {group.text && (!group.lines || group.lines.length === 0) && (
            <Text size='micro' variant='label' component='p' className='normal-case'>
              {group.text}
            </Text>
          )}
          {group.words !== undefined &&
            (group.words ? (
              <pre className='max-h-64 overflow-y-auto whitespace-pre-wrap break-words bg-bgSecondary p-2 text-micro'>
                {group.words}
              </pre>
            ) : null)}
        </WmgGroup>
      ))}
      {inventory && <NotSent items={inventory.notSent} />}
    </WmgShell>
  );
}
