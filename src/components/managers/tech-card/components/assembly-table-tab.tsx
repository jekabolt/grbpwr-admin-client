import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react';
import { Text } from 'ui';
import type { ConstructionTab } from './construction-tab';

const LazyConstructionTab = lazy(async () => {
  const module = await import('./construction-tab');
  return { default: module.ConstructionTab };
});

export const ASSEMBLY_TABLE_TAB_MOUNT_CONTRACT = Object.freeze({
  lazy: true,
  mountsBeforeFirstVisit: false,
  remainsMountedAfterFirstVisit: true,
  ownsSecondOperationEditor: false,
  legacyConstructionUrlIsAliasOnly: true,
});

export function resolveAssemblyTableVisited(visited: boolean, active: boolean): boolean {
  return visited || active;
}

/**
 * Thin production host for the existing Construction/Assembly Order owner.
 *
 * The heavy CAD surface is downloaded and mounted only on the first visit, then kept alive while
 * the operator moves through the rest of the card. Keeping that single mount preserves local CAD
 * state and, more importantly, does not create a second `useFieldArray` writer for operations.
 */
export function AssemblyTableTab({
  active,
  ...props
}: ComponentProps<typeof ConstructionTab> & { active: boolean }) {
  const [visited, setVisited] = useState(active);

  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);

  if (!visited) return null;

  return (
    <Suspense
      fallback={
        <Text component='p' size='small' variant='inactive'>
          opening assembly table…
        </Text>
      }
    >
      <LazyConstructionTab {...props} active={active} />
    </Suspense>
  );
}
