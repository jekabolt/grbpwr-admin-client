import { Suspense, lazy, type ComponentProps } from 'react';

/**
 * THE VECTOR EDITOR, LOADED WHEN FIRST OPENED.
 *
 * `vector-modal.tsx` is ~7800 lines and was pulled into the tech-card tab's chunk by every screen
 * that owns an `edit ▸` door — eleven of them — while a person opens the editor on a fraction of
 * visits. This is the ONE spelling of `VectorModal` the rest of the band imports (through the
 * `./modals` barrel); the real component lives behind `import()` and lands in its own chunk.
 *
 * THE SUSPENSE BOUNDARY IS HERE, NOT IN THE HOSTS. Every host mounts the modal only while it is
 * open (`{open && <VectorModal … />}` or `open` as a prop on an always-mounted node), so the
 * fallback is on screen for the length of one fetch and never beside an early `return` of the host
 * — the boundary and the lazy node are siblings inside this wrapper, below whatever the host does.
 * `null` fallback: the modal is a dialog over a dimmed page, and a «loading…» flash inside a dialog
 * that is not yet drawn has nowhere to stand.
 *
 * Types are read with `typeof import()` — erased at compile time, so the type does not drag the
 * module back into the main chunk.
 */
type Editor = (typeof import('./vector-modal'))['VectorModal'];

export type VectorModalProps = ComponentProps<Editor>;

const LazyVectorModal = lazy(() =>
  import('./vector-modal').then((m) => ({ default: m.VectorModal })),
);

export function VectorModal(props: VectorModalProps) {
  return (
    <Suspense fallback={null}>
      <LazyVectorModal {...props} />
    </Suspense>
  );
}
