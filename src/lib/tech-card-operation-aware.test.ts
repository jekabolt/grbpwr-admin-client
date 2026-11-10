import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
} from 'components/managers/tech-card/components/schema';
import { ECHO_AWARE } from 'lib/fusing-dxf/regenerate';
import { NON_OPERATION_AWARE, OPERATION_FIELDS_AWARE } from './tech-card-operation-aware';

// The «…Aware» flags the generated TechCardInsert declares, read from the generated client itself.
function protoAwareFlags(): string[] {
  const src = readFileSync(
    fileURLToPath(new URL('../api/proto-http/admin/index.ts', import.meta.url)),
    'utf8',
  );
  const start = src.indexOf('export type common_TechCardInsert = {');
  const end = src.indexOf('\n};', start);
  return [...src.slice(start, end).matchAll(/^\s+(\w+Aware): boolean/gm)].map((m) => m[1]);
}

describe('operation-field aware flags', () => {
  it('every aware flag of the proto is placed in one of the two lists', () => {
    const placed = [...Object.keys(OPERATION_FIELDS_AWARE), ...NON_OPERATION_AWARE].sort();
    expect(placed).toEqual(protoAwareFlags().sort());
  });

  it('the fusing DXF rebuild declares every operation-field flag on its echo', () => {
    // 116, 10.11: re-uploading patterns rebuilt the fusing sheets with a card echo that carried the
    // measured topstitch lines but no topstitchLinesAware — «outdated admin client».
    expect(ECHO_AWARE).toMatchObject(OPERATION_FIELDS_AWARE);
    expect(ECHO_AWARE).not.toHaveProperty('cutStripsAware');
  });

  it('the tech card form declares every operation-field flag', () => {
    const form = mapTechCardToForm({ id: 1, techCard: {} } as never);
    expect(mapFormToTechCardInsert(form)).toMatchObject(OPERATION_FIELDS_AWARE);
  });
});
