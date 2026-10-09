// F12 · HP-GL / HP-GL/2 tokenizer. Input is the file as latin1 text (byte values preserved, which
// the 8-bit PE encoding needs). Output is a flat command list; the interpreter owns the state.
//
// Handled syntax: two-letter mnemonics (any case), parameters separated by commas/spaces/signs,
// terminated by `;`, a newline or the next mnemonic; quoted strings (BP, CO); LB text up to the
// label terminator (ETX by default, redefined by DT — tracked HERE because it changes how the
// following bytes are cut); PE bodies up to `;`; SM's one-char parameter; PCL/PJL/device-control
// escape sequences skipped (including PCL binary payloads `ESC * b <n> W <n bytes>`).

export type HpglCmd = {
  /** Upper-case mnemonic, e.g. "PD". */
  op: string;
  args: number[];
  /** LB: label text (terminator stripped). PE: raw encoded body. CO/BP: raw param text. */
  text?: string;
  /** Byte offset of the mnemonic, for diagnostics. */
  at: number;
};

export type Tokenized = {
  cmds: HpglCmd[];
  /** Bytes that belonged to nothing (not a mnemonic, parameter, escape or separator). */
  garbage: number;
  /** Bytes inside escape sequences / PJL lines / binary payloads. */
  escaped: number;
  total: number;
};

/** Every mnemonic of HP-GL/1, HP-GL/2 and the plotter extensions seen in garment-CAD plot files. */
export const KNOWN = new Set(
  (
    'AA AC AD AF AH AP AR AS AT BF BL BP BR BZ CA CC CF CI CM CO CP CR CS CT CV DC DF DI DL DP DR DS DT DV EA EC EP ER ES ET EW ' +
    'FI FN FP FR FS FT GC GM GP IM IN IP IR IV IW KY LA LB LM LO LT MC MG MT NP NR OA OC OD OE OF OG OH OI OK OL OO OP ' +
    'OS OT OW PA PB PC PD PE PG PM PP PR PS PT PU PW QL RA RF RO RP RR RT SA SB SC SD SG SI SL SM SP SR SS ST SV TD TL ' +
    'TR UC UF UL VS WD WG WU XT YT'
  ).split(' '),
);

const ESC = 0x1b;
const ETX = '\x03';

function isLetter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

const NUM_RE = /[-+]?(?:\d+\.?\d*|\.\d+)/g;

export function parseNumbers(s: string): number[] {
  const out: number[] = [];
  NUM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUM_RE.exec(s))) out.push(parseFloat(m[0]));
  return out;
}

/** Skips one escape sequence starting at s[i] === ESC; returns the index after it. */
function skipEscape(s: string, i: number): number {
  const n = s.length;
  const c1 = s.charCodeAt(i + 1);
  if (i + 1 >= n) return n;
  // UEL `ESC%-12345X`, HP-GL/2 enter/exit `ESC%#B` / `ESC%#A`.
  if (c1 === 0x25) {
    let j = i + 2;
    while (j < n && /[-+0-9]/.test(s[j])) j++;
    return Math.min(n, j + 1);
  }
  // HP-GL device control `ESC.X[params]:`.
  if (c1 === 0x2e) {
    let j = i + 3;
    while (j < n && /[0-9;., ]/.test(s[j])) j++;
    if (s[j] === ':') j++;
    return j;
  }
  // PCL parameterized `ESC <!-/> <`-~> {value <param char>}`; upper-case param char terminates.
  if (c1 >= 0x21 && c1 <= 0x2f) {
    let j = i + 3; // after the group char
    for (;;) {
      const v0 = j;
      while (j < n && /[-+0-9.]/.test(s[j])) j++;
      const value = parseFloat(s.slice(v0, j)) || 0;
      if (j >= n) return n;
      const pc = s.charCodeAt(j);
      j++;
      if (pc === 0x57 || pc === 0x77) {
        // W / w: binary payload of `value` bytes follows.
        j += Math.max(0, Math.floor(value));
        if (pc === 0x57) return Math.min(n, j);
        continue;
      }
      if (pc >= 0x40 && pc <= 0x5e) return j; // terminating (upper-case) parameter char
      if (pc >= 0x60 && pc <= 0x7e) continue; // combined (lower-case) parameter char
      return j;
    }
  }
  return i + 2; // two-character escape (ESC E, ESC 9, …)
}

export function tokenize(s: string): Tokenized {
  const cmds: HpglCmd[] = [];
  const n = s.length;
  let i = 0;
  let garbage = 0;
  let escaped = 0;
  let term = ETX;

  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === ESC) {
      const j = skipEscape(s, i);
      escaped += j - i;
      i = j;
      continue;
    }
    if (c === 0x40 && s.startsWith('@PJL', i)) {
      const j = s.indexOf('\n', i);
      const end = j < 0 ? n : j + 1;
      escaped += end - i;
      i = end;
      continue;
    }
    if (c <= 0x20 || c === 0x3b || c === 0x2c) {
      i++;
      continue;
    }
    if (!(isLetter(c) && i + 1 < n && isLetter(s.charCodeAt(i + 1)))) {
      garbage++;
      i++;
      continue;
    }
    const op = s.slice(i, i + 2).toUpperCase();
    const at = i;
    i += 2;

    if (op === 'LB') {
      const j = s.indexOf(term, i);
      const end = j < 0 ? n : j;
      cmds.push({ op, args: [], text: s.slice(i, end), at });
      i = j < 0 ? n : j + term.length;
      continue;
    }
    if (op === 'DT') {
      // DT t[,mode]; — the terminator is the very next char unless it is `;` (= reset to ETX).
      if (i >= n || s[i] === ';') {
        term = ETX;
        cmds.push({ op, args: [], text: ETX, at });
        if (s[i] === ';') i++;
        continue;
      }
      term = s[i];
      i++;
      const j0 = i;
      while (i < n && /[ ,0-9]/.test(s[i])) i++;
      const args = parseNumbers(s.slice(j0, i));
      if (s[i] === ';') i++;
      cmds.push({ op, args, text: term, at });
      continue;
    }
    if (op === 'PE') {
      const j = s.indexOf(';', i);
      const end = j < 0 ? n : j;
      cmds.push({ op, args: [], text: s.slice(i, end), at });
      i = j < 0 ? n : j + 1;
      continue;
    }
    if (op === 'SM') {
      if (i < n && s[i] !== ';') {
        cmds.push({ op, args: [], text: s[i], at });
        i++;
      } else cmds.push({ op, args: [], text: '', at });
      if (s[i] === ';') i++;
      continue;
    }

    // Generic parameters: up to `;`, ESC, or the next letter outside quotes.
    const j0 = i;
    let raw = '';
    while (i < n) {
      const ch = s.charCodeAt(i);
      if (ch === 0x22) {
        const q = s.indexOf('"', i + 1);
        i = q < 0 ? n : q + 1;
        continue;
      }
      if (ch === 0x3b || ch === ESC || isLetter(ch)) break;
      raw += s[i];
      i++;
    }
    if (s[i] === ';') i++;
    const cmd: HpglCmd = { op, args: parseNumbers(raw), at };
    if (op === 'CO' || op === 'BP') cmd.text = s.slice(j0, i);
    cmds.push(cmd);
  }
  return { cmds, garbage, escaped, total: n };
}

/**
 * Sniff: does this text read as plotter commands? ≥ 3 known mnemonics, at least one that moves
 * the pen, and almost no stray bytes. Runs on a head slice, so it is cheap.
 */
export function looksLikeHpgl(head: string): boolean {
  const slice = head.slice(0, 16 * 1024);
  const t = tokenize(slice);
  if (t.cmds.length < 3) return false;
  let known = 0;
  let moves = false;
  for (const c of t.cmds) {
    if (KNOWN.has(c.op)) known++;
    if (
      c.op === 'PU' ||
      c.op === 'PD' ||
      c.op === 'PA' ||
      c.op === 'PR' ||
      c.op === 'PE' ||
      c.op === 'IN'
    )
      moves = true;
  }
  const payload = t.total - t.escaped;
  return moves && known / t.cmds.length >= 0.8 && t.garbage <= Math.max(4, payload * 0.02);
}
