// Placeholder: lane L3 writes this page. Same props contract as every tech pack page.
import type { common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';

export function QcPage(_props: {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
}) {
  return null;
}
