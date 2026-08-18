import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { TaskInsert } from '../api/types';
import {
  archiveConfig,
  fittingConfig,
  orderConfig,
  productConfig,
  projectConfig,
  runConfig,
  sampleConfig,
  techCardConfig,
} from '../utils/entity-configs';
import { EntityConfig } from './entity-picker';
import { EntityPicker } from './entity-picker';

/**
 * tskLinks v2 — ONE picker, type first. The seven typed FKs on a task used to be
 * seven stacked named pickers; here you choose the entity TYPE, then search inside
 * it. Set links show as removable chips above; picking a value for a type that is
 * already linked overwrites it (each FK is single). Every link type still works.
 */

export type LinkField =
  | 'techCardId'
  | 'productId'
  | 'orderUuid'
  | 'archiveId'
  | 'fittingId'
  | 'sampleId'
  | 'productionRunId'
  | 'projectTopicId';

type LinkType = { field: LinkField; label: string; config: EntityConfig };

const LINK_TYPES: LinkType[] = [
  { field: 'techCardId', label: 'tech card', config: techCardConfig },
  { field: 'productId', label: 'product', config: productConfig },
  { field: 'orderUuid', label: 'order', config: orderConfig },
  { field: 'fittingId', label: 'fitting', config: fittingConfig },
  { field: 'sampleId', label: 'sample', config: sampleConfig },
  { field: 'productionRunId', label: 'run', config: runConfig },
  { field: 'archiveId', label: 'timeline drop', config: archiveConfig },
  { field: 'projectTopicId', label: 'project', config: projectConfig },
];

const typeItems = LINK_TYPES.map((t) => ({ value: t.field, label: t.label }));

function isSet(value: number | string, empty: number | string) {
  return !(value === empty || value === 0 || value === '');
}

// A set link, its display name resolved best-effort via the entity's single-get RPC.
function SetLinkChip({
  type,
  value,
  onRemove,
}: {
  type: LinkType;
  value: number | string;
  onRemove: () => void;
}) {
  const { data } = useQuery({
    queryKey: ['tasks', 'link-editor', type.field, value],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => type.config.resolve(value),
  });
  const name = data?.label ?? `#${value}`;
  return (
    <Chip onRemove={onRemove} title={`${type.label}: ${name}`}>
      <span className='max-w-[18ch] truncate'>
        {type.label}: {name}
      </span>
    </Chip>
  );
}

export function LinkEditor({
  links,
  setLink,
}: {
  links: Record<LinkField, number | string>;
  setLink: (field: LinkField, value: number | string) => void;
}) {
  const [type, setType] = useState<LinkType>(LINK_TYPES[0]);
  const setTypes = LINK_TYPES.filter((t) => isSet(links[t.field], t.config.empty));

  return (
    <div className='flex flex-col gap-2'>
      {setTypes.length > 0 && (
        <ChipRow>
          {setTypes.map((t) => (
            <SetLinkChip
              key={t.field}
              type={t}
              value={links[t.field]}
              onRemove={() => setLink(t.field, t.config.empty)}
            />
          ))}
        </ChipRow>
      )}

      <div className='flex flex-col gap-1.5'>
        <div className='flex items-center gap-2'>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            add link
          </Text>
          <div className='w-40'>
            <SelectComponent
              name='link-type'
              items={typeItems}
              value={type.field}
              onValueChange={(v: string) =>
                setType(LINK_TYPES.find((t) => t.field === v) ?? LINK_TYPES[0])
              }
              placeholder='link type'
              fullWidth
            />
          </div>
        </div>
        <EntityPicker
          key={type.field}
          config={type.config}
          value={type.config.empty}
          onChange={(v) => setLink(type.field, v)}
        />
      </div>
    </div>
  );
}
