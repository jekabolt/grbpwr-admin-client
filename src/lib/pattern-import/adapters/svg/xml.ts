// F12 · Minimal tolerant XML parser for SVG — no DOM, so it runs in a worker.
// Handles: XML declaration, comments, processing instructions, DOCTYPE with an internal subset
// (Illustrator declares `<!ENTITY ns_svg "http://www.w3.org/2000/svg">` and uses `&ns_svg;` in
// attributes), CDATA, single/double/unquoted attributes, self-closing tags, the five built-in
// entities and numeric references. Tolerance: a stray close tag is ignored, a missing one is
// closed at the parent's close / EOF.

export type XNode = {
  /** Qualified name as written ("path", "svg:path", "inkscape:namedview"). */
  name: string;
  /** Local name (after the prefix). */
  local: string;
  prefix: string;
  attrs: Record<string, string>;
  children: XChild[];
  parent: XNode | null;
};
export type XChild = XNode | string;

const BUILTIN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string, ents: Record<string, string>): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z_][\w.-]*);/g, (m, body: string) => {
    if (body[0] === '#') {
      const cp =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    if (body in BUILTIN) return BUILTIN[body];
    if (body in ents) return ents[body];
    return m;
  });
}

function split(name: string): { prefix: string; local: string } {
  const i = name.indexOf(':');
  return i < 0
    ? { prefix: '', local: name }
    : { prefix: name.slice(0, i), local: name.slice(i + 1) };
}

export type XmlDoc = { root: XNode | null; entities: Record<string, string>; comments: string[] };

export function parseXml(src: string): XmlDoc {
  const doc: XNode = {
    name: '#document',
    local: '#document',
    prefix: '',
    attrs: {},
    children: [],
    parent: null,
  };
  const entities: Record<string, string> = {};
  const comments: string[] = [];
  let cur = doc;
  let i = 0;
  const n = src.length;

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      pushText(cur, src.slice(i), entities);
      break;
    }
    if (lt > i) pushText(cur, src.slice(i, lt), entities);
    i = lt;

    if (src.startsWith('<!--', i)) {
      const e = src.indexOf('-->', i + 4);
      comments.push(src.slice(i + 4, e < 0 ? n : e));
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const e = src.indexOf(']]>', i + 9);
      cur.children.push(src.slice(i + 9, e < 0 ? n : e));
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith('<!', i)) {
      // DOCTYPE (with an optional [internal subset]) or a stray declaration.
      let j = i + 2;
      let depth = 0;
      while (j < n) {
        const ch = src[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '"' || ch === "'") {
          const q = src.indexOf(ch, j + 1);
          j = q < 0 ? n : q;
        } else if (ch === '>' && depth <= 0) break;
        j++;
      }
      const decl = src.slice(i, j + 1);
      const re = /<!ENTITY\s+([A-Za-z_][\w.-]*)\s+(?:"([^"]*)"|'([^']*)')\s*>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(decl))) entities[m[1]] = m[2] ?? m[3] ?? '';
      i = j + 1;
      continue;
    }
    if (src.startsWith('<?', i)) {
      const e = src.indexOf('?>', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (src.startsWith('</', i)) {
      const e = src.indexOf('>', i + 2);
      const name = src.slice(i + 2, e < 0 ? n : e).trim();
      i = e < 0 ? n : e + 1;
      // Pop to the matching open element; ignore a close tag that matches nothing.
      let k: XNode | null = cur;
      while (k && k !== doc && k.name !== name) k = k.parent;
      if (k && k !== doc) cur = k.parent ?? doc;
      continue;
    }

    // Start tag.
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const name = src.slice(i + 1, j);
    if (!name) {
      pushText(cur, '<', entities);
      i++;
      continue;
    }
    const attrs: Record<string, string> = {};
    let selfClose = false;
    for (;;) {
      while (j < n && /\s/.test(src[j])) j++;
      if (j >= n) break;
      if (src[j] === '>') {
        j++;
        break;
      }
      if (src[j] === '/' && src[j + 1] === '>') {
        selfClose = true;
        j += 2;
        break;
      }
      const a0 = j;
      while (j < n && !/[\s=/>]/.test(src[j])) j++;
      const an = src.slice(a0, j);
      while (j < n && /\s/.test(src[j])) j++;
      let val = '';
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, j + 1);
          val = src.slice(j + 1, e < 0 ? n : e);
          j = e < 0 ? n : e + 1;
        } else {
          const v0 = j;
          while (j < n && !/[\s>]/.test(src[j])) j++;
          val = src.slice(v0, j);
        }
      }
      if (an) attrs[an] = decodeEntities(val, entities);
      else j++;
    }
    const { prefix, local } = split(name);
    const node: XNode = { name, local, prefix, attrs, children: [], parent: cur };
    cur.children.push(node);
    if (!selfClose) cur = node;
    i = j;
  }

  const root = doc.children.find((c): c is XNode => typeof c !== 'string') ?? null;
  if (root) root.parent = null;
  return { root, entities, comments };
}

function pushText(cur: XNode, raw: string, ents: Record<string, string>): void {
  if (!raw) return;
  cur.children.push(decodeEntities(raw, ents));
}

/** Concatenated text content of a node (used for <style>). */
export function textOf(n: XNode): string {
  let s = '';
  for (const c of n.children) s += typeof c === 'string' ? c : textOf(c);
  return s;
}
