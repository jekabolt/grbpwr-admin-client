import DxfParser, { type IDxf } from 'dxf-parser';
import type { Unit } from '../types';
import { detectUnit, unitFactorCm } from '../units';

const BINARY_SENTINEL = 'AutoCAD Binary DXF';

export type ParsedDxf = {
  dxf: IDxf;
  unit: Exclude<Unit, 'auto'>;
  cmPerUnit: number;
  unitGuessed: boolean;
};

// Decode + guard + parse one DXF file. Binary DXF / DWG are rejected with actionable
// messages (the parser would otherwise produce garbage or null).
export function parseDxf(buf: ArrayBuffer, unitOverride: Unit): ParsedDxf {
  const head = new Uint8Array(buf.slice(0, 22));
  const headStr = new TextDecoder('latin1').decode(head);
  if (headStr.startsWith(BINARY_SENTINEL)) {
    throw new Error('бинарный DXF — пересохраните файл как ASCII DXF');
  }
  if (headStr.startsWith('AC10') || headStr.startsWith('AC12') || headStr.startsWith('AC14')) {
    throw new Error('это DWG, а не DXF — экспортируйте DXF из CAD');
  }

  // UTF-8 first; broken sequences (cp1251 block names are common) fall back to latin1 so
  // geometry always survives — only names may mangle.
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('latin1').decode(buf);
  }

  const parser = new DxfParser();
  let dxf: IDxf | null = null;
  try {
    dxf = parser.parseSync(text);
  } catch (e) {
    throw new Error(`не удалось разобрать DXF: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!dxf) throw new Error('не удалось разобрать DXF (пустой результат парсера)');

  const header = (dxf.header ?? {}) as Record<string, unknown>;
  const insunits = typeof header['$INSUNITS'] === 'number' ? (header['$INSUNITS'] as number) : undefined;

  if (unitOverride !== 'auto') {
    return { dxf, unit: unitOverride, cmPerUnit: unitFactorCm(unitOverride), unitGuessed: false };
  }
  const det = detectUnit(insunits);
  return { dxf, unit: det.unit, cmPerUnit: det.cm, unitGuessed: det.guessed };
}
