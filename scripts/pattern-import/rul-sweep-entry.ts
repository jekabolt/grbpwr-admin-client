// Sweep: every real DXF + RUL pair given on the command line (or found under the given folders)
// must expand, or refuse with a reason. Prints one line per pair; exits 1 when a pair listed in
// MUST_PASS refuses.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { expandRul, parseRul } from 'lib/pattern-import/adapters/rul';

const ab = (path: string) => {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

function rulsUnder(path: string): string[] {
  const st = statSync(path);
  if (st.isFile()) return /\.rul$/i.test(path) ? [path] : [];
  return readdirSync(path).flatMap((n) =>
    n === 'node_modules' || n.startsWith('.') ? [] : rulsUnder(join(path, n)),
  );
}

function dxfFor(rul: string): string | null {
  const dir = dirname(rul);
  const stem = basename(rul).replace(/\.rul$/i, '');
  const hit = readdirSync(dir).find((n) => n.toLowerCase() === `${stem.toLowerCase()}.dxf`);
  return hit ? join(dir, hit) : null;
}

const roots = process.argv.slice(2).map((p) => resolve(p));
let bad = 0;
let ok = 0;
for (const rulPath of roots.flatMap(rulsUnder)) {
  const dxfPath = dxfFor(rulPath);
  if (!dxfPath) continue;
  try {
    const rul = parseRul(ab(rulPath), basename(rulPath));
    const out = expandRul({
      dxf: ab(dxfPath),
      dxfName: basename(dxfPath),
      rul,
      rulName: basename(rulPath),
    });
    ok++;
    if (process.env.RUL_SWEEP_OUT)
      writeFileSync(join(process.env.RUL_SWEEP_OUT, `${basename(rulPath)}.sizes.dxf`), out.text);
    const s = out.stats;
    console.log(
      `ok      ${rulPath}  pieces ${s.pieces} sizes ${s.sizes} ruled ${s.ruled} interp ${s.interpolated} follow ${s.following} interior ${s.interior} still ${s.still} sha ${createHash('sha256').update(out.text).digest('hex').slice(0, 12)}`,
    );
  } catch (e) {
    bad++;
    console.log(`REFUSED ${rulPath}\n        ${(e as Error).message}`);
  }
}
console.log(`\n${ok} expanded, ${bad} refused`);
if (bad && process.env.RUL_SWEEP_STRICT) process.exit(1);
