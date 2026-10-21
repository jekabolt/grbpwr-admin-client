// PATTERN-IMPORT · GOLDEN — one file end to end through the autopilot (the real wizard hook, 0
// clicks), the export kept on disk (env AUTOPILOT_DXF_OUT). Arg: a JSON spec
//   {"id": "<e2e case id or free id>", "file": "<abs path>", "card"?: [...sizes], "cardName"?: "..."}
// A known e2e case id reuses that case (card sizes, card name), only the file is replaced.
import { runCase } from './autopilot-entry';
import { CASES } from './e2e-entry';
import { toWireError } from 'lib/pattern-import/worker/errors';

export async function main(args: string[]): Promise<number> {
  const spec = JSON.parse(args[0]) as {
    id: string;
    file: string;
    card?: string[];
    cardName?: string;
  };
  const base = CASES.find((c) => c.id === spec.id);
  const c = {
    ...(base ?? { id: spec.id, group: 'pdf' as const, card: spec.card ?? [] }),
    files: [spec.file],
    ...(spec.card ? { card: spec.card } : {}),
    ...(spec.cardName ? { cardName: spec.cardName } : {}),
  };
  let r: Record<string, unknown>;
  try {
    r = await runCase(c as never, null);
  } catch (e) {
    r = { id: spec.id, verdict: 'crashed', error: toWireError(e).message.slice(0, 600) };
  }
  console.log(`@@RESULT ${JSON.stringify(r)}`);
  return 0;
}
