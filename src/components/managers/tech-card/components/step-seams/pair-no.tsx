import { PAIR_INK, pairNo } from './palette';

/** A stored pair's number: an 18px box in the pair ink (square: the design gate forbids radius). */
export function PairNo({ i }: { i: number }) {
  return (
    <span
      className='inline-flex size-4.5 shrink-0 items-center justify-center border text-micro leading-none tabular-nums'
      style={{ color: PAIR_INK, borderColor: PAIR_INK }}
      data-pair-no={i + 1}
    >
      {pairNo(i)}
    </span>
  );
}
