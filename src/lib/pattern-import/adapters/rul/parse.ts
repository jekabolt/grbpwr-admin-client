// RUL · the text grade rule table of AAMA / ASTM D6673 — reader (strict) and writer.
// Grammar (RUL-SPEC.md §2):
//
//   ASTM/D13Proposal 1 VERSION: D6673-04        ← first line: the format/version banner
//   PRODUCT: …   DATE: …   TIME: …   AUTHOR: …  ← optional header lines, `KEY: value`
//   UNITS: METRIC | ENGLISH
//   GRADE RULE TABLE: <name>
//   NUMBER OF SIZES: n
//   SIZE LIST: s1 s2 … sn                       ← may wrap over several lines
//   SAMPLE SIZE: sk
//   RULE: DELTA <id>                            ← then n `dx,dy` pairs, one per size in SIZE LIST
//   dx,dy dx,dy …                                  order, measured from the sample size (its pair
//   …                                              is 0,0); pairs may wrap over several lines
//   END
//
// Refused (UnsupportedFormat 'rul-invalid', the reason named): no banner, no / unknown UNITS, a size
// count that disagrees with the list, a sample size not in the list, a rule with the wrong number of
// pairs, a pair that is not two numbers, a rule id defined twice, a sample pair that is not 0,0 (the
// deltas would not be measured from the sample — we do not guess another convention), no rules.

import { UnsupportedFormat } from '../sniff/errors';
import type { RulDelta, RulTable, RulUnits } from './types';

const refuse = (detail: string) => new UnsupportedFormat('rul-invalid', detail);

/** Largest RUL we read (a whole AccuMark rule library is far below this). */
export const RUL_MAX_BYTES = 8 * 1024 * 1024;

/** The banner / keys that say "this text is a grade rule table". */
const BANNER = /^\s*(ASTM\s*\/\s*D\s*13\s*Proposal|ANSI\s*\/\s*AAMA|AAMA)/i;
const HAS_TABLE = /GRADE\s+RULE\s+TABLE\s*:/i;
const HAS_RULE = /^\s*RULE\s*:\s*DELTA\b/im;

function headText(bytes: ArrayBuffer, max = 64 * 1024): string | null {
  const u = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, max));
  // a text RUL is printable ASCII / latin1 (size names may carry accents); a binary one is not
  let ctl = 0;
  for (const b of u) if (b < 9 || (b > 13 && b < 32) || b === 127) ctl++;
  if (ctl > 0) return null;
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return s.startsWith('\xef\xbb\xbf') ? s.slice(3) : s;
}

/** True for a TEXT grade rule table (an AccuMark binary .rul is not one). */
export function looksLikeRul(bytes: ArrayBuffer): boolean {
  const h = headText(bytes);
  if (h === null) return false;
  return (BANNER.test(h) || HAS_TABLE.test(h)) && HAS_TABLE.test(h) && HAS_RULE.test(h);
}

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

function units(v: string): { units: RulUnits; mmPerUnit: number } {
  const u = v.trim().toUpperCase();
  if (u === 'METRIC') return { units: 'metric', mmPerUnit: 1 };
  if (u === 'ENGLISH') return { units: 'english', mmPerUnit: 25.4 };
  throw refuse(`UNITS: "${v.trim()}" is neither METRIC nor ENGLISH`);
}

/** The numbers of a rule's data line: separators are commas, blanks, tabs (RUL-SPEC §2.4). */
function numbersOf(text: string): number[] | null {
  const toks = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const out: number[] = [];
  for (const t of toks) {
    if (!NUM.test(t)) return null;
    out.push(Number(t));
  }
  return out;
}

/** Strict reader. `name` is the file name, for the messages. */
export function parseRul(bytes: ArrayBuffer, name = 'the RUL'): RulTable {
  if (bytes.byteLength > RUL_MAX_BYTES)
    throw refuse(
      `${name} is ${(bytes.byteLength / 1048576).toFixed(1)} MB — larger than any grade rule table`,
    );
  const text = headText(bytes, bytes.byteLength);
  if (text === null) throw refuse(`${name} is not a text grade rule table (binary bytes)`);
  const lines = text.split(/\r\n|\r|\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const banner = (lines[i] ?? '').trim();
  if (!BANNER.test(banner))
    throw refuse(
      `${name} does not start with the AAMA/ASTM banner ("ASTM/D13Proposal 1 VERSION: …") — found "${banner.slice(0, 60)}"`,
    );
  i++;
  const head: Record<string, string> = {};
  let sizeList: string[] | null = null;
  const rules = new Map<number, RulDelta[]>();
  const warnings: string[] = [];
  let ended = false;
  let cur: { id: number; nums: number[]; line: number } | null = null;
  const closeRule = () => {
    if (!cur) return;
    if (cur.nums.length % 2)
      throw refuse(
        `${name}: rule ${cur.id} (line ${cur.line}) has an odd count of numbers (${cur.nums.length}) — not dx,dy pairs`,
      );
    const pairs: RulDelta[] = [];
    for (let k = 0; k < cur.nums.length; k += 2)
      pairs.push({ dx: cur.nums[k], dy: cur.nums[k + 1] });
    rules.set(cur.id, pairs);
    cur = null;
  };
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^END\s*$/i.test(line)) {
      closeRule();
      ended = true;
      break;
    }
    const rule = /^RULE\s*:\s*(\S+)\s+(\S+)\s*$/i.exec(line);
    if (rule) {
      closeRule();
      if (rule[1].toUpperCase() !== 'DELTA')
        throw refuse(
          `${name} line ${i + 1}: "RULE: ${rule[1]}" — only DELTA rules are defined by the format`,
        );
      if (!/^-?\d+$/.test(rule[2]))
        throw refuse(`${name} line ${i + 1}: rule id "${rule[2]}" is not an integer`);
      const id = Number(rule[2]);
      if (!Number.isSafeInteger(id))
        throw refuse(`${name} line ${i + 1}: rule id ${rule[2]} is too large`);
      if (rules.has(id)) throw refuse(`${name} line ${i + 1}: rule ${id} is defined twice`);
      cur = { id, nums: [], line: i + 1 };
      continue;
    }
    if (cur) {
      const p = numbersOf(line);
      if (!p)
        throw refuse(
          `${name} line ${i + 1}: "${line.slice(0, 50)}" is not a list of dx,dy numbers (rule ${cur.id})`,
        );
      cur.nums.push(...p);
      continue;
    }
    const kv = /^([A-Za-z][A-Za-z .]*?)\s*:\s*(.*)$/.exec(line);
    if (kv) {
      const key = kv[1].trim().toUpperCase().replace(/\s+/g, ' ');
      if (key === 'SIZE LIST') sizeList = kv[2].trim().split(/\s+/).filter(Boolean);
      else head[key] = kv[2].trim();
      continue;
    }
    // a SIZE LIST that wraps: bare size names right after it
    if (sizeList && !rules.size && head['SAMPLE SIZE'] === undefined) {
      sizeList.push(...line.split(/\s+/).filter(Boolean));
      continue;
    }
    throw refuse(`${name} line ${i + 1}: "${line.slice(0, 50)}" is not part of the format`);
  }
  closeRule();
  if (!ended) warnings.push('the file has no END line (every rule read is complete)');

  if (head['UNITS'] === undefined) throw refuse(`${name} has no UNITS line`);
  const u = units(head['UNITS']);
  if (!sizeList?.length) throw refuse(`${name} has no SIZE LIST`);
  const n = Number(head['NUMBER OF SIZES']);
  if (head['NUMBER OF SIZES'] !== undefined && (!Number.isInteger(n) || n !== sizeList.length))
    throw refuse(
      `${name}: NUMBER OF SIZES says ${head['NUMBER OF SIZES']}, the SIZE LIST names ${sizeList.length} (${sizeList.join(' ')})`,
    );
  // the importer reads sizes decoration-stripped (`<S>` = `S`, `4-6` = `4/6`): one of those twice is
  // two columns of one size
  const canon = (s: string) =>
    s
      .replace(/(\d)[^\p{L}\p{N}.,]+(?=\d)/gu, '$1/')
      .replace(/[^\p{L}\p{N}.,/]+/gu, '')
      .toUpperCase();
  const sample = head['SAMPLE SIZE'];
  if (!sample) throw refuse(`${name} has no SAMPLE SIZE`);
  const sampleKey = canon(sample);
  const sampleIndices = sizeList.flatMap((size, index) =>
    canon(size) === sampleKey ? [index] : [],
  );
  if (!sampleIndices.length)
    throw refuse(
      `${name}: the SAMPLE SIZE ${sample} is not in the SIZE LIST (${sizeList.join(' ')})`,
    );
  const counts = new Map<string, number>();
  sizeList.forEach((size) => counts.set(canon(size), (counts.get(canon(size)) ?? 0) + 1));
  const repeatedOther = [...counts].find(([key, count]) => count > 1 && key !== sampleKey);
  if (repeatedOther)
    throw refuse(`${name}: the SIZE LIST names a size twice (${sizeList.join(' ')})`);
  if (!rules.size) throw refuse(`${name} defines no RULE: DELTA`);
  for (const [id, pairs] of rules) {
    if (pairs.length !== sizeList.length)
      throw refuse(
        `${name}: rule ${id} has ${pairs.length} dx,dy pairs for ${sizeList.length} sizes`,
      );
    const zero = sampleIndices.find((index) => {
      const s = pairs[index];
      return Math.abs(s.dx) <= 1e-9 && Math.abs(s.dy) <= 1e-9;
    });
    if (zero === undefined) {
      const s = pairs[sampleIndices[0]];
      throw refuse(
        sampleIndices.length === 1
          ? `${name}: rule ${id} moves the sample size ${sample} by ${s.dx},${s.dy} — the deltas are not measured from the sample, and no other convention is read`
          : `${name}: rule ${id} has no 0,0 column for the repeated sample size ${sample}`,
      );
    }
    // Grafis writes the sample breakpoint twice and, per rule, places 0,0 in the occurrence that
    // belongs to that rule's grade range. They are one logical size: keep its zero column and drop
    // the other occurrence. Arbitrary duplicate sizes remain invalid above.
    if (sampleIndices.length > 1) {
      const normalized: RulDelta[] = [];
      let wroteSample = false;
      pairs.forEach((pair, index) => {
        if (!sampleIndices.includes(index)) normalized.push(pair);
        else if (!wroteSample) {
          normalized.push({ dx: 0, dy: 0 });
          wroteSample = true;
        }
      });
      rules.set(id, normalized);
    }
  }
  const declaredSizes = [...sizeList];
  if (sampleIndices.length > 1) {
    let kept = false;
    sizeList = sizeList.filter((_, index) => {
      if (!sampleIndices.includes(index)) return true;
      if (kept) return false;
      kept = true;
      return true;
    });
    warnings.push(
      `the SIZE LIST repeats sample ${sample} ${sampleIndices.length} times: read as one breakpoint size`,
    );
  }
  const sampleIndex = sizeList.findIndex((s) => canon(s) === sampleKey);
  return {
    version: banner,
    product: head['PRODUCT'] ?? null,
    author: head['AUTHOR'] ?? null,
    date: head['DATE'] ?? null,
    time: head['TIME'] ?? null,
    ...u,
    name: head['GRADE RULE TABLE'] ?? '',
    sizes: sizeList,
    ...(sampleIndices.length > 1 ? { declaredSizes } : {}),
    sample: sizeList[sampleIndex],
    sampleIndex,
    breaks: [],
    rules,
    warnings,
  };
}

// ── writer ────────────────────────────────────────────────────────────────────────────────────

/** Number as the RUL writes it: fixed, trailing zeros trimmed, never `-0`. */
export function rulNum(v: number, digits = 4): string {
  if (!Number.isFinite(v)) throw new Error(`non-finite grade delta ${v}`);
  let s = v.toFixed(digits);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '.0');
  return s === '-0.0' ? '0.0' : s;
}

/** Pairs per line when a rule's pairs are written (the corpus of vendor files wraps long rules). */
export const RUL_PAIRS_PER_LINE = 5;

export function formatRul(t: {
  product: string;
  author: string;
  date: Date;
  units: RulUnits;
  name: string;
  sizes: string[];
  sample: string;
  rules: Map<number, RulDelta[]>;
  digits?: number;
}): string {
  const pad = (x: number) => String(x).padStart(2, '0');
  const d = t.date;
  const L: string[] = [
    'ASTM/D13Proposal 1 VERSION: D6673-04',
    `PRODUCT: ${t.product}`,
    `DATE: ${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${d.getUTCFullYear()}`,
    `TIME: ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    `AUTHOR: ${t.author}`,
    `UNITS: ${t.units === 'metric' ? 'METRIC' : 'ENGLISH'}`,
    `GRADE RULE TABLE: ${t.name}`,
    `NUMBER OF SIZES: ${t.sizes.length}`,
    `SIZE LIST: ${t.sizes.join(' ')}`,
    `SAMPLE SIZE: ${t.sample}`,
  ];
  for (const id of [...t.rules.keys()].sort((a, b) => a - b)) {
    L.push(`RULE: DELTA ${id}`);
    const ps = t.rules.get(id)!.map((p) => `${rulNum(p.dx, t.digits)},${rulNum(p.dy, t.digits)}`);
    for (let k = 0; k < ps.length; k += RUL_PAIRS_PER_LINE)
      L.push(ps.slice(k, k + RUL_PAIRS_PER_LINE).join(' '));
  }
  L.push('END');
  return `${L.join('\r\n')}\r\n`;
}
