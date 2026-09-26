import type { GetDesignBandResponse } from 'api/proto-http/admin';
import type { JSX } from 'react';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import { WORKFLOWS } from './registry';
import { whyNot } from './registry/common';
import type { WorkflowDef, WorkflowKey } from './registry/types';
import { WorkflowGlyph } from './workflow-glyph';

/**
 * ═══ THE GRID — PICK A WORKFLOW (C-03, owner framing «сначала гридом … пользователь будет
 * выбирать») ════════════════════════════════════════════════════════════════════════════════════
 *
 * Twelve tiles in the owner's order. A tile is the whole door into its workflow — one press opens
 * it; there is no second «open» button. A tile this server cannot run is drawn quieter, says why in
 * words, and is not a button at all: it cannot be opened into a form whose GENERATE the server would
 * refuse.
 */
export function workflowOpenable(def: WorkflowDef, band: GetDesignBandResponse): boolean {
  return !whyNot(def, band);
}

export function WorkflowGrid({
  band,
  onOpen,
}: {
  band: GetDesignBandResponse;
  onOpen: (key: WorkflowKey) => void;
}): JSX.Element {
  return (
    <Tiles min={148} className='gap-3'>
      {WORKFLOWS.map((def) => {
        const reason = whyNot(def, band);
        const live = !reason;
        return (
          <Tile
            key={def.key}
            onClick={live ? () => onOpen(def.key) : undefined}
            title={live ? `open ${def.title}` : `${def.title} — ${reason}`}
            dashed={!live}
            className={live ? 'group p-3' : 'p-3'}
            media={
              <span
                className={
                  live
                    ? 'flex aspect-[4/3] items-center justify-center bg-bgSecondary text-textColor'
                    : 'flex aspect-[4/3] items-center justify-center text-textInactiveColor'
                }
                data-workflow-tile={def.key}
                data-workflow-live={live ? '' : undefined}
              >
                <WorkflowGlyph workflow={def.key} />
              </span>
            }
          >
            <Text
              size='micro'
              component='span'
              className={
                live
                  ? 'mt-3 font-bold uppercase group-hover:underline'
                  : 'mt-3 font-bold uppercase text-labelColor'
              }
            >
              {def.title}
            </Text>
            <Text size='micro' variant='label' component='span' className='mt-1 normal-case'>
              {def.blurb}
            </Text>
            {!live && (
              <Text
                size='micro'
                variant='label'
                component='span'
                tracking='label'
                className='mt-3 uppercase'
              >
                {reason}
              </Text>
            )}
          </Tile>
        );
      })}
    </Tiles>
  );
}
