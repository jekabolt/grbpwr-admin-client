import { Section, Text } from 'ui';

/** One block of the kit: the barrel exports it shows and the demo that renders them. */
export type KitDemo = {
  /** Export names from 'ui'. The first is the block id; the rest get wrapping anchors. */
  names: string[];
  Demo: React.ComponentType;
  /** Header note when the block is not a barrel export (defaults to its import line). */
  question?: string;
  /** Display name when it is not the id (an id cannot hold a space). */
  title?: string;
  /** Extra words `find` matches, for blocks people look for by another name. */
  keywords?: string[];
};

export type KitGroup = {
  label: string;
  demos: KitDemo[];
  /** Context the group's demos need (react-hook-form for the form fields). */
  Provider?: React.ComponentType<{ children: React.ReactNode }>;
};

/**
 * Section per primitive. Every export name is an element id, so `/ui-kit#ChipRow` lands on the
 * Chip block: extra names wrap the Section in zero-cost block anchors instead of adding children
 * (a child would add a stack gap).
 */
export function KitEntry({
  names,
  question,
  title,
  children,
}: {
  names: string[];
  question?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [id, ...rest] = names;
  let node = (
    <Section
      id={id}
      title={title ?? id}
      question={question ?? `import { ${names.join(', ')} } from 'ui'`}
    >
      {children}
    </Section>
  );
  for (const extra of rest) {
    node = (
      <div id={extra} className='scroll-mt-20'>
        {node}
      </div>
    );
  }
  return node;
}

export function KitLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

/** Variant × size (or state) grid: a label column, then one column per `cols` entry. */
export function KitMatrix({
  cols,
  rows,
  labelWidth = 120,
}: {
  cols: string[];
  rows: { label: string; cells: React.ReactNode[] }[];
  labelWidth?: number;
}) {
  return (
    <div
      className='grid items-center gap-2.5'
      style={{ gridTemplateColumns: `${labelWidth}px repeat(${cols.length}, minmax(0, 1fr))` }}
    >
      <span />
      {cols.map((c) => (
        <KitLabel key={c}>{c}</KitLabel>
      ))}
      {rows.map((r) => [
        <KitLabel key={`${r.label}:label`}>{r.label}</KitLabel>,
        ...r.cells.map((cell, i) => (
          <div key={`${r.label}:${i}`} className='flex min-w-0 items-center'>
            {cell}
          </div>
        )),
      ])}
    </div>
  );
}

/** Label column + one free-form content cell per line. */
export function KitLines({
  lines,
  labelWidth = 120,
}: {
  lines: { label: string; content: React.ReactNode }[];
  labelWidth?: number;
}) {
  return (
    <KitMatrix
      cols={['']}
      rows={lines.map((l) => ({ label: l.label, cells: [l.content] }))}
      labelWidth={labelWidth}
    />
  );
}

/** Crossed sample: a shape that must not ship. `data-kit-dont` keeps it out of the golden checks. */
export function Crossed({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative w-full' data-kit-dont=''>
      {children}
      <svg
        aria-hidden
        className='pointer-events-none absolute inset-0 h-full w-full text-error'
        preserveAspectRatio='none'
        viewBox='0 0 100 100'
      >
        <line
          x1='0'
          y1='100'
          x2='100'
          y2='0'
          stroke='currentColor'
          vectorEffect='non-scaling-stroke'
        />
      </svg>
    </div>
  );
}
