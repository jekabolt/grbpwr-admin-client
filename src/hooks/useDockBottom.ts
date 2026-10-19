import { useLayoutEffect, type DependencyList, type RefObject } from 'react';

/**
 * A bar fixed to the bottom of the viewport declares the space it takes in `--dock-bottom-h`
 * on `body`, so toasts stand above it.
 *
 * `lift` also pads `body` and sets `data-dock-bottom` (rule in `global.css`): content in flow and
 * `sticky bottom-0` bars move up too. Docks over a live grid need it; save bars do not.
 *
 * Measured as the distance from the window's bottom edge, not the node's height: a dock that
 * floats 10px above the edge still owns those 10px. No node or no box = nothing declared.
 */
export function useDockBottom(
  ref: RefObject<HTMLElement | null>,
  deps: DependencyList = [],
  { lift = false }: { lift?: boolean } = {},
): void {
  useLayoutEffect(() => {
    const node = ref.current;
    const set = (px: string) => declare(px, lift);
    if (!node) {
      set('');
      return;
    }
    const apply = () => {
      const box = node.getBoundingClientRect();
      // Hidden at this width (`sm:hidden`): no box, nothing to stand above.
      set(box.height ? `${Math.max(0, Math.round(window.innerHeight - box.top))}px` : '');
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    window.addEventListener('resize', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      set('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lift, ...deps]);
}

function declare(px: string, lift: boolean) {
  const body = document.body;
  if (px) body.style.setProperty('--dock-bottom-h', px);
  else body.style.removeProperty('--dock-bottom-h');
  if (!lift) return;
  body.style.paddingBottom = px;
  if (px) body.dataset.dockBottom = '';
  else delete body.dataset.dockBottom;
}
