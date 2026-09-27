#!/usr/bin/env node
// PROBE for admin → AI providers (C-06). Mounts the REAL page — real hooks, real `api/api`, real
// generated client — in headless chromium; only the network is a stub (every request to
// http://stub.invalid is answered here from `server`, everything else is aborted, so nothing can
// reach a real backend). What is checked is what went over the wire and what the screen says.
//
//   A  the five row states: no key · env key · stored key · fault (+ paused) · switched off
//   B  a switch sends ONE PATCH carrying expected_version as the config's own string
//   C  a route change sends ONE PUT with the whole route (fallback kept); a model is committed once;
//      a route through a switched-off provider says so on its row
//   D  spend: an absent Decimal is —, a present "0" is 0.00; the preset asks for the right days
//   E  the edges: stale → "reload — the config changed" + a re-read; save key → inline probe, field
//      emptied, secret nowhere on screen; no master key → callout + fields off; non-super → /me;
//      clear a stored key → a one-line question first, then ONE PUT with an empty value
//   FE1…FE9  the FIX-E items of the client review (06-BRIEF-FIX-E.md), one check group each
//
//   node scripts/ai-providers-probe.mjs                 all green expected
//   node scripts/ai-providers-probe.mjs --mutate-<name> the named check must go red (list: --list)

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const req = createRequire(import.meta.url);

const dieNotRun = (why) => {
  console.log(`\nNOT RUN: ${why}`);
  console.log('a green or red result in this state would prove nothing.');
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? String(e)));

// ─── MUTATIONS ──────────────────────────────────────────────────────────────────────────────────
// Each names the check it must turn red, and an anchor that must occur EXACTLY once in the bundle.
const MUTATIONS = {
  'key-none': {
    red: 'A1',
    what: 'no key reads as something else',
    from: `return { text: "key: not set", broken: false, stored: false };`,
    to: `return { text: "key: none", broken: false, stored: false };`,
  },
  'key-env': {
    red: 'A2',
    what: 'the env key hides its last four',
    from: 'return { text: `key: from env${last4(p.keyLast4)}`, broken: false, stored: false };',
    to: 'return { text: `key: from env`, broken: false, stored: false };',
  },
  'key-db': {
    red: 'A3',
    what: 'a stored key forgets who stored it',
    from: 'const by = p.keyUpdatedBy ?',
    to: 'const by = false ?',
  },
  'fault-hidden': {
    red: 'A4',
    what: 'the fault badge is never drawn',
    from: 'fault && /* @__PURE__ */',
    to: 'false && /* @__PURE__ */',
  },
  'off-shown-on': {
    red: 'A5',
    what: 'a switched-off provider is drawn on',
    from: 'const enabled = toggle.isPending && toggle.variables ? toggle.variables.enabled : !!p.enabled;',
    to: 'const enabled = toggle.isPending && toggle.variables ? toggle.variables.enabled : true;',
  },
  'toggle-no-version': {
    red: 'B1',
    what: 'the switch write carries no expected_version',
    from: 'enabled: vars.enabled,\n        expectedVersion: expectedVersion(w.qc)',
    to: 'enabled: vars.enabled,\n        expectedVersion: void 0',
  },
  'toggle-twice': {
    red: 'B1',
    what: 'one flip sends two writes',
    from: 'onCheckedChange: (next) => toggle.mutate({ providerKey: key, enabled: next })',
    to: 'onCheckedChange: (next) => { toggle.mutate({ providerKey: key, enabled: next }); toggle.mutate({ providerKey: key, enabled: next }); }',
  },
  'version-as-number': {
    red: 'B1',
    what: 'the version is sent back as a number',
    from: 'return version;',
    to: 'return Number(version);',
  },
  'no-queue': {
    red: 'B2',
    what: 'two quick writes are not queued',
    from: 'WRITE_OPTIONS = { retry: false, scope: WRITE_SCOPE };',
    to: 'WRITE_OPTIONS = { retry: false };',
  },
  'route-drops-fallback': {
    red: 'C1',
    what: 'a primary change drops the fallback',
    from: 'model: "" },\n                  fallback: serverFallback\n',
    to: 'model: "" }\n',
  },
  'route-twice': {
    red: 'C1',
    what: 'one route change sends two writes',
    from: 'route.mutate({ purpose: key, primary: next.primary, fallback: next.fallback });',
    to: '{ route.mutate({ purpose: key, primary: next.primary, fallback: next.fallback }); route.mutate({ purpose: key, primary: next.primary, fallback: next.fallback }); }',
  },
  'off-note-from-fallback': {
    red: 'C4',
    what: 'the "primary provider is off" note is computed from the fallback',
    from: 'const primaryOff = providerOff(config, capability, primary);',
    to: 'const primaryOff = providerOff(config, capability, fallback);',
  },
  'off-ignores-default': {
    red: 'C4',
    what: 'a "default" candidate is never checked against the default provider\'s switch',
    from: 'const key = c.providerKey || defaultKeyFor(config, capability) || "";',
    to: 'const key = c.providerKey;',
  },
  'model-no-commit': {
    red: 'C2',
    what: 'a typed model is never committed',
    from: 'onBlur: commit,',
    to: 'onBlur: () => {},',
  },
  'fallback-none-kept': {
    red: 'C3',
    what: '"none" still sends a fallback',
    from: 'if (serverFallback) send2({ primary });',
    to: 'if (serverFallback) send2({ primary, fallback: { providerKey: "", model: "" } });',
  },
  'absent-is-zero': {
    red: 'D1',
    what: 'an absent Decimal renders as 0.00',
    from: 'return n === null ? null : USD.format(n);',
    to: 'return USD.format(n ?? 0);',
  },
  'last-month-off': {
    red: 'D2',
    what: 'last month ends on the first of this month',
    from: 'to: fmtDay(new Date(Date.UTC(y, m, 0)))',
    to: 'to: fmtDay(new Date(Date.UTC(y, m, 1)))',
  },
  'stale-generic': {
    red: 'E1',
    what: 'a stale refusal is toasted in the server words',
    from: 'return (status === 400 || status === 409) && /\\bstale\\b/i.test(error.message);',
    to: 'return false;',
  },
  'key-kept': {
    red: 'E2',
    what: 'the key stays in the field after a save',
    from: 'setValue("");',
    to: 'void 0;',
  },
  'locks-ignored': {
    red: 'E3',
    what: 'no master key, fields still open',
    from: 'const keysLocked = config?.masterKeyPresent === false;',
    to: 'const keysLocked = false;',
  },
  'no-redirect': {
    red: 'E4',
    what: 'a non-super account stays on the page',
    from: 'const denied = resolved && !isSuper;',
    to: 'const denied = false;',
  },
  'key-cleared-on-success-only': {
    red: 'FE1',
    what: 'the field lets go of the key only when the save succeeds',
    edits: [
      { from: 'const sent = trimmed;\n      setValue("");', to: 'const sent = trimmed;' },
      { from: 'onSuccess: (resp) => {\n            setFailure(null);', to: 'onSuccess: (resp) => {\n            setValue("");\n            setFailure(null);' },
    ],
  },
  'key-no-reset': {
    red: 'FE1',
    what: 'the settled key write is never reset (variables.value kept)',
    from: 'onSettled: releaseSecret',
    to: 'onSettled: () => {}',
  },
  'fallback-send-anyway': {
    red: 'FE2',
    what: 'a fallback identical to the primary is sent anyway',
    from: 'if (next.fallback && sameCandidate(config, capability, next.primary, next.fallback)) {',
    to: 'if (false) {',
  },
  'fallback-list-unfiltered': {
    red: 'FE2',
    what: 'the fallback list offers the choice that copies the primary',
    from: '.filter((i) => i.value === selected || choiceFate(config, capability, i.value, other) !== "omit")',
    to: '.filter(() => true)',
  },
  'route-error-unrendered': {
    red: 'FE7',
    what: 'a refused route write leaves no line under its row',
    from: '(WriteError, { text: rowError, id: "route" })',
    to: '(WriteError, { text: null, id: "route" })',
  },
  'switch-error-unrendered': {
    red: 'FE7',
    what: 'a refused switch leaves no line under it',
    from: '(WriteError, { text: toggle.failure?.text, id: "switch", className: "ml-auto text-right" })',
    to: '(WriteError, { text: null, id: "switch", className: "ml-auto text-right" })',
  },
  'their-label-dropped': {
    red: 'FE3',
    what: 'the "provider days" label is dropped from their total',
    // esbuild writes the middle dot as the escape \xB7 (backslash included) in its output.
    from: 'label: "their total \\xB7 usd \\xB7 provider days"',
    to: 'label: "their total \\xB7 usd"',
  },
  'spend-before-config': {
    red: 'FE4',
    what: 'the spend report is asked for before the org timezone is known (browser zone)',
    from: 'const orgTz = config?.timezone || "";',
    to: 'const orgTz = config?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;',
  },
  'spend-keeps-previous': {
    red: 'FE4',
    what: 'a new period keeps the previous report on screen while it loads',
    from: 'staleTime: 6e4,\n      enabled: enabled && Boolean(from) && Boolean(to)',
    to: 'staleTime: 6e4,\n      placeholderData: (prev) => prev,\n      enabled: enabled && Boolean(from) && Boolean(to)',
  },
  'clear-sends-old-value': {
    red: 'E5',
    what: 'clear sends the old key (its last four) instead of an empty value',
    from: '{ providerKey: key, kind, value: "" }',
    to: '{ providerKey: key, kind, value: p.keyLast4 ?? "" }',
  },
  'clear-skipped': {
    red: 'E5',
    what: '"yes" never sends the clear',
    from: 'onClick: clear, disabled: save.isPending',
    to: 'onClick: () => {}, disabled: save.isPending',
  },
  'clear-no-confirm': {
    red: 'E5',
    what: '"clear" writes at once, without the question',
    from: 'onClick: () => setConfirming(true)',
    to: 'onClick: clear',
  },
  'clear-everywhere': {
    red: 'E5',
    what: '"clear" is offered on an env key too',
    from: 'line.stored && ',
    to: 'true && ',
  },
};

if (process.argv.includes('--list')) {
  for (const [k, m] of Object.entries(MUTATIONS)) console.log(`--mutate-${k.padEnd(20)} ${m.red}  ${m.what}`);
  process.exit(0);
}
const chosen = Object.keys(MUTATIONS).filter((k) => process.argv.includes(`--mutate-${k}`));

// ─── BROWSER + CSS ──────────────────────────────────────────────────────────────────────────────
function resolvePlaywright() {
  try {
    return req.resolve('playwright');
  } catch {
    /* the npx cache below */
  }
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync(
      'find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch {
    return null;
  }
}
const pwPath = resolvePlaywright();
if (!pwPath) dieNotRun('playwright not found — no live stand');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright found, but without chromium');

let cssDir = [];
try {
  cssDir = readdirSync(resolve(REPO, 'dist/assets'));
} catch {
  dieNotRun('no dist/assets — run `yarn build` first');
}
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('no dist/assets/index-*.css — run `yarn build` first');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

// ─── BUNDLE ─────────────────────────────────────────────────────────────────────────────────────
const STUB_ORIGIN = 'http://stub.invalid';
const outfile = resolve(tmpdir(), `ai-providers-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'ai-providers-probe-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  absWorkingDir: REPO,
  nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
  jsx: 'automatic',
  minify: false,
  outfile,
  logLevel: 'warning',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  alias: { '@': resolve(REPO, 'src') },
  define: {
    'import.meta.env': `{"VITE_SERVER_URL":"${STUB_ORIGIN}","MODE":"production"}`,
    'import.meta.env.VITE_SERVER_URL': `"${STUB_ORIGIN}"`,
    'process.env.NODE_ENV': '"production"',
  },
}).catch((e) => dieNotRun(`the bundle did not build: ${e.message}`));

let bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
// The real client must be in: the probe measures the generated client's HTTP, not a stand-in.
if (!bundle.includes('createAdminServiceClient(')) dieNotRun('the generated client is not in the bundle');
if (!bundle.includes(`"${STUB_ORIGIN}"`)) dieNotRun('the server URL is not the stub — a request could leave');

if (process.argv.includes('--dump')) {
  writeFileSync(process.argv[process.argv.indexOf('--dump') + 1], bundle);
  process.exit(0);
}

for (const k of chosen) {
  const m = MUTATIONS[k];
  // A mutation is one edit (from → to) or several (`edits`), each anchored exactly once.
  for (const e of m.edits ?? [{ from: m.from, to: m.to }]) {
    const n = bundle.split(e.from).length - 1;
    if (n !== 1) dieNotRun(`MUTATION «${k}» NOT APPLIED: anchor found ${n} times instead of once`);
    bundle = bundle.replace(e.from, e.to);
  }
  console.log(`  MUTATION: ${k} — ${m.what} (must turn ${m.red} red)`);
}

let bad = 0;
const failed = new Set();
const ck = (id, ok, what, d = '') => {
  if (!ok) {
    bad++;
    failed.add(id);
  }
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${id} ${what}${d ? `  — ${d}` : ''}`);
};

// ─── SERVER ─────────────────────────────────────────────────────────────────────────────────────
const TZ = 'Europe/Warsaw';
const clone = (x) => JSON.parse(JSON.stringify(x));
const model = (slug, kind, extra = {}) => ({ slug, label: slug, kind, custom: false, priced: true, ...extra });
const PROVIDERS = [
  // A · no key at all
  { key: 'openai', label: 'OpenAI', enabled: true, capabilities: ['chat', 'image'], keySource: 'none', keyLast4: '', keyUpdatedBy: '', keyUpdatedAt: null, adminKeySupported: true, adminKeySource: 'none', adminKeyLast4: '', breaker: 'closed', faultCode: '', note: '', models: [model('gpt-5.2', 'chat'), model('gpt-5-mini', 'chat'), model('gpt-image-2', 'image')] },
  // A · env key
  { key: 'anthropic', label: 'Anthropic', enabled: true, capabilities: ['chat'], keySource: 'env', keyLast4: 'ab12', keyUpdatedBy: '', keyUpdatedAt: null, adminKeySupported: true, adminKeySource: 'none', adminKeyLast4: '', breaker: 'closed', faultCode: '', note: '', models: [model('claude-sonnet-5', 'chat'), model('claude-opus-5', 'chat', { custom: true, priced: false })] },
  // A · stored key
  { key: 'google', label: 'Google', enabled: true, capabilities: ['chat', 'image'], keySource: 'db', keyLast4: '9f3c', keyUpdatedBy: 'im', keyUpdatedAt: '2026-09-27T10:00:00Z', adminKeySupported: false, adminKeySource: 'none', adminKeyLast4: '', breaker: 'closed', faultCode: '', note: '', models: [model('gemini-3-pro', 'chat')] },
  // A · fault + open breaker
  { key: 'openrouter', label: 'OpenRouter', enabled: true, capabilities: ['chat', 'image'], keySource: 'env', keyLast4: 'zz99', keyUpdatedBy: '', keyUpdatedAt: null, adminKeySupported: false, adminKeySource: 'none', adminKeyLast4: '', breaker: 'open', faultCode: 'out_of_credits', note: '', models: [model('anthropic/claude-sonnet-5', 'chat'), model('openai/gpt-image-2', 'image')] },
  // A · switched off
  { key: 'fal', label: 'fal', enabled: false, capabilities: ['threed', 'cutout'], keySource: 'env', keyLast4: 'f00d', keyUpdatedBy: '', keyUpdatedAt: null, adminKeySupported: true, adminKeySource: 'none', adminKeyLast4: '', breaker: 'closed', faultCode: '', note: 'design generation is off on this server', models: [model('fal-ai/trellis', 'threed')] },
];
const PURPOSES = [
  { key: 'chat.note_markdown', label: 'Note to markdown', hint: 'the ✦ button in a library note', group: 'chat', capability: 'chat', primary: { providerKey: '', model: '' }, fallback: { providerKey: 'openai', model: 'gpt-5-mini' } },
  { key: 'threed', label: '3D', hint: 'the 3D tile', group: '3d', capability: 'threed', primary: { providerKey: 'fal', model: 'fal-ai/trellis' }, fallback: null },
  // FE2: a primary on its provider's default model, and one on a named model; neither has a fallback.
  { key: 'chat.email_translate', label: 'Email translate', hint: 'auto-translate a campaign', group: 'chat', capability: 'chat', primary: { providerKey: 'openai', model: '' }, fallback: null },
  { key: 'chat.techcard_analysis', label: 'Construction audit', hint: 'the audit on a tech card', group: 'chat', capability: 'chat', primary: { providerKey: 'openai', model: 'gpt-5' }, fallback: null },
  { key: 'image.generate', label: 'Design images', hint: 'flat, render, recolour, pattern, playground tiles', group: 'images', capability: 'image', primary: { providerKey: '', model: '' }, fallback: null },
];
const dec = (v) => (v === null ? null : { value: v });
const SPEND = {
  timezone: TZ,
  totalUsd: dec('12.5'),
  calls: 9,
  failed: 1,
  unpriced: 2,
  byProvider: [
    { providerKey: 'openai', ourUsd: dec('12.5'), theirUsd: null, calls: 5, failed: 1, unpriced: 0 },
    { providerKey: 'anthropic', ourUsd: dec('0'), theirUsd: null, calls: 2, failed: 0, unpriced: 0 },
    { providerKey: 'google', ourUsd: null, theirUsd: null, calls: 2, failed: 0, unpriced: 2 },
  ],
  byActor: [
    { actor: 'im', actorAdminId: 1, purpose: 'chat.note_markdown', providerKey: 'openai', model: 'gpt-5.2', usd: dec('12.5'), calls: 5 },
    { actor: 'im', actorAdminId: 1, purpose: 'chat.note_markdown', providerKey: 'google', model: '', usd: null, calls: 2 },
    { actor: 'system', actorAdminId: 0, purpose: 'chat.note_markdown', providerKey: 'anthropic', model: 'claude-sonnet-5', usd: dec('0'), calls: 2 },
  ],
};

let server;
function freshServer(opts = {}) {
  server = {
    version: 7,
    providers: clone(PROVIDERS).map((p) => ({ ...p, ...(opts.patch?.[p.key] ?? {}) })),
    purposes: clone(PURPOSES),
    defaultChat: 'openrouter',
    defaultImage: 'openrouter',
    masterKey: opts.masterKey ?? true,
    // The server's env keys (their last four): what answers once a stored key is cleared.
    env: { anthropic: 'ab12', openrouter: 'zz99', fal: 'f00d', ...(opts.env ?? {}) },
    isSuper: opts.isSuper ?? true,
    forceStale: false,
    probe: { ok: true, code: '', message: '', balance: '24.50 USD' },
    failKey: opts.failKey ?? false,
    configDelayMs: opts.configDelayMs ?? 0,
    spendDelayMs: 0,
    spendTz: opts.spendTz,
    calls: [],
    delayMs: opts.delayMs ?? 0,
  };
}
const config = () => ({
  providers: server.providers,
  purposes: server.purposes,
  defaultChatProviderKey: server.defaultChat,
  defaultImageProviderKey: server.defaultImage,
  // uint64 on the wire is a JSON string, exactly as the gateway sends it.
  configVersion: String(server.version),
  masterKeyPresent: server.masterKey,
  timezone: TZ,
  priceVersion: '2026-09-27',
  designGenerationEnabled: false,
});
const stale = () => ({ status: 400, body: { code: 9, message: 'the page is stale — reload', details: [] } });
const versioned = (body, apply) => {
  if (server.forceStale || body.expectedVersion !== String(server.version)) return stale();
  apply();
  server.version += 1;
  return { status: 200, body: { config: config() } };
};

function answer(method, path, query, body) {
  if (method === 'GET' && path === '/api/admin/accounts/me')
    return { status: 200, body: { account: { username: 'im', isSuper: server.isSuper, disabled: false, permissions: [{ section: 'settings', access: 'ACCESS_LEVEL_WRITE' }] } } };
  if (method === 'GET' && path === '/api/admin/accounts/sections') return { status: 200, body: { sections: [] } };
  if (method === 'GET' && path === '/api/admin/ai/providers') return { status: 200, body: config() };
  let m;
  if (method === 'PATCH' && (m = path.match(/^\/api\/admin\/ai\/providers\/([^/]+)$/)))
    return versioned(body, () => {
      server.providers.find((p) => p.key === m[1]).enabled = body.enabled;
    });
  if (method === 'PUT' && (m = path.match(/^\/api\/admin\/ai\/providers\/([^/]+)\/key$/))) {
    const p = server.providers.find((x) => x.key === m[1]);
    if (server.failKey && body.value !== '')
      return { status: 400, body: { code: 3, message: 'the provider refused this key: it is not an api key', details: [] } };
    if (body.value === '') {
      // A clear: the slot empties, the env key (if any) answers again, and nothing is probed —
      // `probe` is unset, which the gateway writes as null.
      const env = server.env[p.key] ?? '';
      if (body.kind === 'admin') Object.assign(p, { adminKeySource: 'none', adminKeyLast4: '' });
      else Object.assign(p, { keySource: env ? 'env' : 'none', keyLast4: env, keyUpdatedBy: '', keyUpdatedAt: null });
      return { status: 200, body: { probe: null, config: config() } };
    }
    if (body.kind === 'admin') Object.assign(p, { adminKeySource: 'db', adminKeyLast4: body.value.slice(-4) });
    else Object.assign(p, { keySource: 'db', keyLast4: body.value.slice(-4), keyUpdatedBy: 'im', keyUpdatedAt: '2026-09-27T12:00:00Z' });
    return { status: 200, body: { probe: server.probe, config: config() } };
  }
  if (method === 'PUT' && path === '/api/admin/ai/defaults')
    return versioned(body, () => {
      if (body.chatProviderKey) server.defaultChat = body.chatProviderKey;
      if (body.imageProviderKey) server.defaultImage = body.imageProviderKey;
    });
  if (method === 'PUT' && (m = path.match(/^\/api\/admin\/ai\/routes\/([^/]+)$/))) {
    // The server's same-ness rule (FD-8): model equal AND provider equal once "" is resolved to the
    // capability's default (a blank default = openrouter).
    const pu = server.purposes.find((x) => x.key === decodeURIComponent(m[1]));
    const resolve = (k) => k || (pu.capability === 'chat' ? server.defaultChat : pu.capability === 'image' ? server.defaultImage : '') || 'openrouter';
    const f = body.fallback;
    if (f && (f.model ?? '') === (body.primary?.model ?? '') && resolve(f.providerKey) === resolve(body.primary?.providerKey))
      return {
        status: 400,
        body: {
          code: 3,
          message: 'fallback: same_as_primary; the fallback is the primary itself; choose another provider or model, or no fallback',
          details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'fallback', description: 'same_as_primary; the fallback is the primary itself; choose another provider or model, or no fallback' }] }],
        },
      };
  }
  if (method === 'PUT' && (m = path.match(/^\/api\/admin\/ai\/routes\/([^/]+)$/)))
    return versioned(body, () => {
      const pu = server.purposes.find((x) => x.key === decodeURIComponent(m[1]));
      pu.primary = body.primary;
      pu.fallback = body.fallback ?? null;
    });
  if (method === 'GET' && path === '/api/admin/ai/spend')
    return { status: 200, body: { ...clone(SPEND), timezone: server.spendTz ?? TZ, fromDay: query.get('fromDay'), toDay: query.get('toDay') } };
  return { status: 404, body: { code: 5, message: `probe server: no ${method} ${path}` } };
}

// ─── PAGE ───────────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.on('pageerror', (e) => console.log('  [page]', String(e).slice(0, 300)));
await page.route('http://probe.local/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.route(`${STUB_ORIGIN}/**`, async (r) => {
  const rq = r.request();
  const url = new URL(rq.url());
  const raw = rq.postData();
  const body = raw ? JSON.parse(raw) : null;
  server.calls.push({ method: rq.method(), path: url.pathname, query: url.search, body });
  if (server.delayMs) await new Promise((res) => setTimeout(res, server.delayMs));
  // FE4: the config (the org timezone) and the spend report can each be held back.
  if (server.configDelayMs && rq.method() === 'GET' && url.pathname === '/api/admin/ai/providers')
    await new Promise((res) => setTimeout(res, server.configDelayMs));
  if (server.spendDelayMs && url.pathname === '/api/admin/ai/spend')
    await new Promise((res) => setTimeout(res, server.spendDelayMs));
  // Injected refusals (FE7): the first matching entry answers instead of the server, once.
  const hit = (server.fail ?? []).findIndex((f) => f.method === rq.method() && f.re.test(url.pathname));
  const injected = hit >= 0 ? server.fail.splice(hit, 1)[0] : null;
  const { status, body: out } = injected
    ? { status: injected.status ?? 400, body: injected.body }
    : answer(rq.method(), url.pathname, url.searchParams, body ?? {});
  await r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(out) });
});
// Anything else — a real backend, a CDN — never answers.
await page.route(/^https?:\/\/(?!probe\.local|stub\.invalid)/, (r) => r.abort());

async function mount({ start = '/ai-providers', ...opts } = {}) {
  freshServer(opts);
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.evaluate((url) => {
    globalThis.__START = url;
  }, start);
  await page.addScriptTag({ content: bundle });
  await page.waitForTimeout(700);
}
const writes = (method, re) => server.calls.filter((c) => c.method === method && re.test(c.path));

const row = (key) => page.locator(`[data-provider="${key}"]`);
const rowText = async (key) => ((await row(key).first().textContent()) ?? '').replace(/\s+/g, ' ');
const openRow = async (key) => {
  await row(key).locator('button[aria-expanded]').first().click();
  await page.waitForTimeout(150);
};
const toast = async () => ((await page.locator('body').textContent()) ?? '').replace(/\s+/g, ' ');

// --shots DIR: screenshots of the tab's states (desktop and phone width) instead of the checks —
// the evidence a design pass reads. Nothing is asserted in this mode.
if (process.argv.includes('--shots')) {
  const dir = process.argv[process.argv.indexOf('--shots') + 1];
  // PROBE_INJECT=<file.js>: a page-side checker (a design linter, say) injected into every state,
  // its console lines printed beside the state's name.
  const inject = process.env.PROBE_INJECT;
  let heard = [];
  page.on('console', (m) => heard.push(m.text()));
  const shoot = async (name, width, start, opts, prep) => {
    await page.setViewportSize({ width, height: 900 });
    await mount({ start, ...opts });
    if (prep) await prep();
    await page.waitForTimeout(300);
    if (inject) {
      heard = [];
      await page.addScriptTag({ content: readFileSync(inject, 'utf8') });
      await page.waitForTimeout(2500);
      console.log(`[${name}-${width}]`, heard.filter((t) => !t.startsWith('[BE]')).join('\n  '));
    }
    await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
  };
  const openKeys = async () => {
    await page.waitForSelector('[data-provider="openai"]');
    await openRow('openai');
    await row('openai').getByLabel('OpenAI key', { exact: true }).fill('sk-shot-1234');
    await row('openai').getByRole('button', { name: 'save key' }).first().click();
    await page.waitForTimeout(500);
  };
  for (const w of [1280, 390]) {
    await shoot('providers', w, '/ai-providers', {}, openKeys);
    await shoot('routes', w, '/ai-providers', {}, async () => {
      await page.waitForSelector('[data-purpose="chat.techcard_analysis"]');
      await page.getByRole('combobox', { name: 'Construction audit fallback', exact: true }).click();
      await page.getByRole('option', { name: 'OpenAI', exact: true }).click();
      await page.waitForTimeout(300);
      const f = page.getByRole('combobox', { name: 'Construction audit fallback model', exact: true });
      await f.fill('gpt-5');
      await f.press('Enter');
      await page.waitForTimeout(300);
      await page.locator('[data-purpose="chat.techcard_analysis"]').scrollIntoViewIfNeeded();
    });
    await shoot('errors', w, '/ai-providers', {}, async () => {
      await page.waitForSelector('[data-purpose="chat.note_markdown"]');
      server.fail = [
        { method: 'PATCH', re: /openai$/, status: 400, body: { code: 3, message: 'openai cannot be switched off while it is the only chat provider', details: [] } },
        { method: 'PUT', re: /defaults$/, status: 400, body: { code: 3, message: 'google does not serve chat on this server', details: [] } },
        { method: 'PUT', re: /note_markdown$/, status: 400, body: { code: 3, message: 'the model is not served by this provider', details: [] } },
      ];
      await row('openai').getByRole('switch').click();
      await page.waitForTimeout(500);
      await page.getByRole('combobox', { name: 'default for chat', exact: true }).click();
      await page.getByRole('option', { name: 'Google', exact: true }).click();
      await page.waitForTimeout(500);
      await page.getByRole('combobox', { name: 'Note to markdown primary', exact: true }).click();
      await page.getByRole('option', { name: 'Anthropic', exact: true }).click();
      await page.waitForTimeout(600);
    });
    await shoot('spendtz', w, '/ai-providers?view=spend', { spendTz: 'UTC' }, async () => {
      await page.waitForSelector('[data-spend-provider="openai"]');
    });
    await shoot('keyfail', w, '/ai-providers', { failKey: true }, async () => {
      await page.waitForSelector('[data-provider="openai"]');
      await openRow('openai');
      await row('openai').getByLabel('OpenAI key', { exact: true }).fill('sk-shot-refused');
      await row('openai').getByRole('button', { name: 'save key' }).first().click();
      await page.waitForTimeout(600);
    });
    await shoot('nomaster', w, '/ai-providers', { masterKey: false }, async () => {
      await page.waitForSelector('[data-provider="anthropic"]');
      await openRow('anthropic');
    });
    await shoot('spend', w, '/ai-providers?view=spend&range=custom&from=2026-09-01&to=2026-09-27', {}, async () => {
      await page.waitForSelector('[data-spend-actor="im"]');
      await page.locator('[data-spend-actor="im"] button').click();
    });
  }
  await browser.close();
  console.log(`shots written to ${dir}`);
  process.exit(0);
}

// ═══ A · THE FIVE ROW STATES ═══════════════════════════════════════════════════════════════════
console.log('\nA · row states');
await mount();
await page.waitForSelector('[data-provider="openai"]', { timeout: 8000 });
{
  // The key line lives in the row's panel, and one panel is open at a time: open, read, move on.
  await openRow('openai');
  const t1 = await rowText('openai');
  ck('A1', t1.includes('key: not set'), 'no key → "key: not set"', t1.slice(0, 120));
  await openRow('anthropic');
  const t2 = await rowText('anthropic');
  ck('A2', t2.includes('key: from env ···ab12'), 'env key → "key: from env ···ab12"', t2.slice(0, 120));
  await openRow('google');
  const t3 = await rowText('google');
  ck('A3', t3.includes('key: set ···9f3c · by im · 27 sep'), 'stored key → "key: set ···9f3c · by im · 27 sep"', t3.slice(0, 120));
  const t4 = await rowText('openrouter');
  ck('A4', /out of credits/i.test(t4) && /paused/i.test(t4), 'fault → "out of credits" pill + open breaker → "paused"', t4.slice(0, 120));
  const t2noPill = !/paused|rejected|credits/i.test(await rowText('anthropic'));
  ck('A4', t2noPill, 'a healthy provider carries no pill');
  const offSwitch = await row('fal').getByRole('switch').getAttribute('aria-checked');
  const onSwitch = await row('openai').getByRole('switch').getAttribute('aria-checked');
  const t5 = await rowText('fal');
  ck('A5', offSwitch === 'false' && onSwitch === 'true' && /\boff\b/i.test(t5), 'off → switch unchecked + "off"; on → checked', `fal=${offSwitch} openai=${onSwitch}`);
  ck('A5', t5.includes('design generation is off on this server'), 'the server note stands under the name');
  // One panel at a time: opening google above closed anthropic.
  const panels = await page.locator('[id^="ai-provider-panel-"]').count();
  ck('A6', panels === 1, 'the name opens ONE panel at a time', `open panels: ${panels}`);
  await openRow('openai');
  const recon = await rowText('openai');
  const closed = (await rowText('google')).includes('key: set');
  ck('A6', !closed, 'opening openai closed google');
  ck('A6', recon.includes('reconciliation key (optional): not set'), 'admin-key providers show the reconciliation slot');
  const foot = await toast();
  ck('A6', foot.includes('master key: present · timezone: Europe/Warsaw · prices: 2026-09-27'), 'footer line');
}

// ═══ B · THE SWITCH ════════════════════════════════════════════════════════════════════════════
console.log('\nB · switch autosave');
await mount();
await page.waitForSelector('[data-provider="openai"]', { timeout: 8000 });
{
  await row('openai').getByRole('switch').click();
  await page.waitForTimeout(700);
  const w = writes('PATCH', /^\/api\/admin\/ai\/providers\/openai$/);
  ck('B1', w.length === 1, 'one flip → ONE PATCH /api/admin/ai/providers/openai', `writes: ${w.length}`);
  const b = w[0]?.body ?? {};
  ck('B1', b.enabled === false && b.expectedVersion === '7', 'body: enabled=false, expectedVersion="7" (the config string, as a string)', JSON.stringify(b));
  const after = await row('openai').getByRole('switch').getAttribute('aria-checked');
  ck('B1', after === 'false', 'the switch shows the saved state', `aria-checked=${after}`);
  const all = server.calls.filter((c) => c.method !== 'GET');
  ck('B1', all.length === 1, 'nothing else was written', JSON.stringify(all.map((c) => `${c.method} ${c.path}`)));
}
await mount({ delayMs: 250 });
await page.waitForSelector('[data-provider="openai"]', { timeout: 8000 });
{
  // Two switches flipped in a row, the first still in flight: the second must wait and carry the
  // version the first one produced, not the one both read.
  await row('anthropic').getByRole('switch').click();
  await row('google').getByRole('switch').click();
  await page.waitForTimeout(1500);
  const w = writes('PATCH', /^\/api\/admin\/ai\/providers\//);
  const versions = w.map((c) => c.body.expectedVersion);
  ck('B2', w.length === 2 && versions[0] === '7' && versions[1] === '8', 'two quick flips go one after the other: versions 7 then 8', JSON.stringify(versions));
  const t = await toast();
  ck('B2', !t.includes('reload — the config changed'), 'neither is refused as stale');
}

// ═══ C · ROUTES ════════════════════════════════════════════════════════════════════════════════
console.log('\nC · route autosave');
await mount();
await page.waitForSelector('[data-purpose="chat.note_markdown"]', { timeout: 8000 });
{
  const order = await page.locator('[data-route-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-route-group')));
  ck('C0', JSON.stringify(order) === '["chat","images","3d"]', 'groups in the order chat, images, 3d', JSON.stringify(order));
  await page.getByRole('combobox', { name: 'Note to markdown primary', exact: true }).click();
  await page.getByRole('option', { name: 'Anthropic' }).click();
  await page.waitForTimeout(700);
  const w = writes('PUT', /^\/api\/admin\/ai\/routes\//);
  ck('C1', w.length === 1 && w[0].path === '/api/admin/ai/routes/chat.note_markdown', 'one change → ONE PUT /api/admin/ai/routes/chat.note_markdown', `writes: ${w.length}`);
  const b = w[0]?.body ?? {};
  ck(
    'C1',
    b.primary?.providerKey === 'anthropic' && b.primary?.model === '' && b.fallback?.providerKey === 'openai' && b.fallback?.model === 'gpt-5-mini' && b.expectedVersion === '7',
    'body: new primary, the fallback as it stood, expectedVersion "7"',
    JSON.stringify(b),
  );
}
await mount();
await page.waitForSelector('[data-purpose="chat.note_markdown"]', { timeout: 8000 });
{
  const field = page.getByRole('combobox', { name: 'Note to markdown primary model', exact: true });
  await field.fill('claude-opus-5');
  await page.waitForTimeout(200);
  const typing = writes('PUT', /^\/api\/admin\/ai\/routes\//).length;
  await field.press('Enter');
  await page.waitForTimeout(700);
  const w = writes('PUT', /^\/api\/admin\/ai\/routes\//);
  ck('C2', typing === 0 && w.length === 1 && w[0].body.primary?.model === 'claude-opus-5', 'typing sends nothing; Enter commits ONE PUT with the typed slug', `during typing ${typing}, after ${w.length}: ${JSON.stringify(w[0]?.body?.primary)}`);
}
await mount();
await page.waitForSelector('[data-purpose="chat.note_markdown"]', { timeout: 8000 });
{
  await page.getByRole('combobox', { name: 'Note to markdown fallback', exact: true }).click();
  await page.getByRole('option', { name: 'none' }).click();
  await page.waitForTimeout(700);
  const w = writes('PUT', /^\/api\/admin\/ai\/routes\//);
  ck('C3', w.length === 1 && !('fallback' in (w[0]?.body ?? {})), 'fallback "none" → the PUT carries no fallback', JSON.stringify(w[0]?.body));
}

// C4 · a route through a switched-off provider says so on its row, in the fault pill's colour.
{
  await mount();
  await page.waitForSelector('[data-purpose="threed"]', { timeout: 8000 });
  const warn = async (purpose) =>
    page.locator(`[data-purpose="${purpose}"] [data-route-warning]`).evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
  const threed = await warn('threed');
  const healthy = await warn('chat.note_markdown');
  ck('C4', JSON.stringify(threed) === '["primary provider is off"]', 'primary on fal while fal is off → "primary provider is off"', JSON.stringify(threed));
  ck('C4', healthy.length === 0, 'a purpose on switched-on providers carries no note', JSON.stringify(healthy));
  const colours = await page.evaluate(() => {
    const note = document.querySelector('[data-purpose="threed"] [data-route-warning]');
    const pill = Array.from(document.querySelectorAll('[data-provider="openrouter"] span')).find((s) => s.textContent === 'out of credits');
    return [note && getComputedStyle(note).color, pill && getComputedStyle(pill).color];
  });
  ck('C4', !!colours[0] && colours[0] === colours[1], 'in the fault pill\'s colour', JSON.stringify(colours));

  // "" is the default provider: with openrouter (both defaults) and openai off, the chat purpose
  // warns for both candidates and the images purpose for its default primary.
  await mount({ patch: { openrouter: { enabled: false }, openai: { enabled: false } } });
  await page.waitForSelector('[data-purpose="threed"]', { timeout: 8000 });
  const chat = await warn('chat.note_markdown');
  const images = await warn('image.generate');
  ck('C4', JSON.stringify(chat) === '["primary provider is off","fallback provider is off"]', '"default" primary (→ openrouter, off) and fallback openai (off) both warn', JSON.stringify(chat));
  ck('C4', JSON.stringify(images) === '["primary provider is off"]', 'the images purpose on "default" (→ openrouter, off) warns', JSON.stringify(images));
}

// FE2 · the fallback can never equal the primary.
{
  await mount();
  await page.waitForSelector('[data-purpose="chat.email_translate"]', { timeout: 8000 });
  const optionsOf = async (name) => {
    await page.getByRole('combobox', { name, exact: true }).click();
    await page.waitForTimeout(250);
    const texts = await page.getByRole('option').allTextContents();
    return texts.map((t) => t.trim());
  };
  const plain = await optionsOf('Email translate fallback');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ck('FE2', plain.length > 0 && !plain.includes('OpenAI') && plain.includes('Anthropic'), 'primary (openai, "") → the fallback list has no OpenAI', JSON.stringify(plain));
  const named = await optionsOf('Construction audit fallback');
  ck('FE2', named.includes('OpenAI'), 'primary (openai, gpt-5) → OpenAI is offered for the fallback', JSON.stringify(named));
  if (named.includes('OpenAI')) {
    await page.getByRole('option', { name: 'OpenAI', exact: true }).click();
    await page.waitForTimeout(500);
    const field = page.getByRole('combobox', { name: 'Construction audit fallback model', exact: true });
    const shown = await field.count();
    const put0 = writes('PUT', /^\/api\/admin\/ai\/routes\//).length;
    ck('FE2', shown === 1 && put0 === 0, 'choosing it stages the provider: the model field, no PUT', `field ${shown}, PUTs ${put0}`);
    if (shown) {
      await field.fill('gpt-5');
      await field.press('Enter');
      await page.waitForTimeout(600);
      const put1 = writes('PUT', /^\/api\/admin\/ai\/routes\//).length;
      const said = ((await page.locator('[data-purpose="chat.techcard_analysis"] [data-candidate="fallback"] [role="alert"]').textContent().catch(() => '')) ?? '').trim();
      ck('FE2', put1 === 0 && said.includes('the fallback is the primary itself'), 'the primary\'s own model is not sent; the sentence stands under the fallback', `PUTs ${put1}; ${said}`);
      // The staged field must still be there, holding the refused slug for a correction.
      const still = (await field.count()) === 1 && (await field.isEnabled().catch(() => false));
      ck('FE2', still, 'the staged field stays for the correction');
      if (still) {
        await field.fill('gpt-5-mini');
        await field.press('Enter');
        await page.waitForTimeout(700);
      }
      const w = writes('PUT', /^\/api\/admin\/ai\/routes\//);
      const b = w[0]?.body ?? {};
      ck('FE2', w.length === 1 && b.primary?.providerKey === 'openai' && b.primary?.model === 'gpt-5' && b.fallback?.providerKey === 'openai' && b.fallback?.model === 'gpt-5-mini', 'another model → ONE PUT with (openai, gpt-5) → (openai, gpt-5-mini)', JSON.stringify(b));
    }
  }
}

// FE7 · a refusal stands beside the control that made it, and only there.
{
  const refuse = (method, re, message, details = []) => ({ method, re, status: 400, body: { code: 3, message, details } });
  const alertsIn = (sel) => page.locator(`${sel} [role="alert"]`).allTextContents();
  const allAlerts = () => page.locator('[data-write-error]').count();

  await mount();
  await page.waitForSelector('[data-purpose="chat.note_markdown"]', { timeout: 8000 });
  server.fail = [refuse('PUT', /^\/api\/admin\/ai\/routes\/chat\.note_markdown$/, 'the model is not served by this provider')];
  await page.getByRole('combobox', { name: 'Note to markdown primary', exact: true }).click();
  await page.getByRole('option', { name: 'Anthropic', exact: true }).click();
  await page.waitForTimeout(900);
  const row1 = await alertsIn('[data-purpose="chat.note_markdown"]');
  const n1 = await allAlerts();
  ck('FE7', row1.some((t) => t.includes('the model is not served by this provider')) && n1 === 1, 'a 400 on a route row: the sentence under THAT row, nowhere else', `${JSON.stringify(row1)}; lines on page ${n1}`);
  // The next successful write of that control clears it.
  await page.getByRole('combobox', { name: 'Note to markdown primary', exact: true }).click();
  await page.getByRole('option', { name: 'Google', exact: true }).click();
  await page.waitForTimeout(900);
  ck('FE7', (await alertsIn('[data-purpose="chat.note_markdown"]')).length === 0, 'the next successful write of the row clears it');

  // A field-tagged refusal lands under its candidate: the server's own same_as_primary.
  const same = 'fallback: same_as_primary; the fallback is the primary itself; choose another provider or model, or no fallback';
  server.fail = [
    refuse('PUT', /^\/api\/admin\/ai\/routes\/chat\.email_translate$/, same, [
      { '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'fallback', description: 'same_as_primary; the fallback is the primary itself; choose another provider or model, or no fallback' }] },
    ]),
  ];
  await page.getByRole('combobox', { name: 'Email translate fallback', exact: true }).click();
  await page.getByRole('option', { name: 'Anthropic', exact: true }).click();
  await page.waitForTimeout(900);
  const fb = await alertsIn('[data-purpose="chat.email_translate"] [data-candidate="fallback"]');
  const inv = await page.getByRole('combobox', { name: 'Email translate fallback', exact: true }).getAttribute('aria-invalid');
  ck('FE7', fb.some((t) => t === '! the fallback is the primary itself; choose another provider or model, or no fallback') && inv === 'true', 'the server\'s same_as_primary stands under the fallback, its select marked invalid', `${JSON.stringify(fb)} aria-invalid=${inv}`);

  // The switch.
  server.fail = [refuse('PATCH', /^\/api\/admin\/ai\/providers\/openai$/, 'openai cannot be switched off while it is the only chat provider')];
  await row('openai').getByRole('switch').click();
  await page.waitForTimeout(900);
  const sw = await alertsIn('[data-provider="openai"]');
  const swInv = await row('openai').getByRole('switch').getAttribute('aria-invalid');
  ck('FE7', sw.some((t) => t.includes('cannot be switched off')) && swInv === 'true', 'a refused switch: the sentence under the switch, the switch marked invalid', `${JSON.stringify(sw)} aria-invalid=${swInv}`);

  // A default select.
  server.fail = [refuse('PUT', /^\/api\/admin\/ai\/defaults$/, 'google does not serve chat on this server')];
  await page.getByRole('combobox', { name: 'default for chat', exact: true }).click();
  await page.getByRole('option', { name: 'Google', exact: true }).click();
  await page.waitForTimeout(900);
  const dc = await alertsIn('[data-route-defaults]');
  ck('FE7', dc.length === 1 && dc[0].includes('google does not serve chat') && (await page.locator('[data-write-error="default-chat"]').count()) === 1, 'a refused default: the sentence under THAT select', JSON.stringify(dc));
}

// ═══ D · SPEND ═════════════════════════════════════════════════════════════════════════════════
console.log('\nD · spend');
await mount({ start: '/ai-providers?view=spend&range=custom&from=2026-09-01&to=2026-09-27' });
await page.waitForSelector('[data-spend-provider="openai"]', { timeout: 8000 });
{
  const cells = async (key) =>
    page.locator(`[data-spend-provider="${key}"] td`).evaluateAll((tds) => tds.map((td) => (td.textContent ?? '').trim()));
  const o = await cells('openai');
  const a = await cells('anthropic');
  const g = await cells('google');
  ck('D1', o[1] === '12.50' && o[2] === '—', 'our 12.50 · their absent → —', JSON.stringify(o));
  ck('D1', a[1] === '0.00', 'a present "0" → 0.00', JSON.stringify(a));
  ck('D1', g[1] === '—', 'an absent our_usd → —', JSON.stringify(g));
  const stats = ((await page.locator('body').textContent()) ?? '').replace(/\s+/g, ' ');
  ck('D1', /their total · usd · provider days\s*—/i.test(stats), 'their total with no provider number → —');
  // FE3 · their number is labelled as counted in the provider's days (D-17).
  const heads = await page.locator('[data-spend-provider="openai"]').locator('xpath=ancestor::table//th').allTextContents();
  const hint = ((await page.locator('[data-provider-days]').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  ck('FE3', /their total · usd · provider days/i.test(stats), 'the stat reads "their total · usd · provider days"');
  ck('FE3', heads.map((h) => h.trim().toLowerCase()).includes('their usd · provider days'), 'the column reads "their usd · provider days"', JSON.stringify(heads));
  ck('FE3', hint === 'a provider counts its own days (utc for most); a local day can differ by up to 2 h at each end', 'one hint under the table says what provider days mean', hint);
  const q = server.calls.find((c) => c.path === '/api/admin/ai/spend')?.query ?? '';
  ck('D1', q === '?fromDay=2026-09-01&toDay=2026-09-27', 'custom days go out as asked', q);
  await page.locator('[data-spend-actor="im"] button').click();
  await page.waitForTimeout(200);
  const lines = await page.locator('[data-spend-line] td').evaluateAll((tds) => tds.map((td) => (td.textContent ?? '').trim()));
  ck('D1', lines.includes('—') && lines.includes('12.50'), 'an account opens into its lines; an unpriced line is —', JSON.stringify(lines));
}
await mount({ start: '/ai-providers?view=spend' });
await page.waitForSelector('[data-spend-provider="openai"]', { timeout: 8000 });
{
  await page.getByRole('radio', { name: 'last month' }).click();
  await page.waitForTimeout(700);
  // Expected days computed here, independently, in the org timezone.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const y = get('year');
  const mo = get('month');
  const first = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, mo - 1, 0)).toISOString().slice(0, 10);
  const q = server.calls.filter((c) => c.path === '/api/admin/ai/spend').map((c) => c.query).at(-1);
  ck('D2', q === `?fromDay=${first}&toDay=${last}`, `"last month" asks for ${first}…${last} (${TZ})`, q);
  const loc = await page.evaluate(() => window.__loc);
  ck('D2', loc.includes('range=last-month'), 'the preset lives in the address', loc);
}

// FE4 · no spend request before the org timezone is known; a new period starts blank.
{
  await mount({ start: '/ai-providers?view=spend', configDelayMs: 1500 });
  await page.waitForTimeout(700);
  const early = server.calls.filter((c) => c.path === '/api/admin/ai/spend').length;
  const waiting = ((await page.locator('[data-spend-period]').textContent().catch(() => '')) ?? '').trim();
  ck('FE4', early === 0, 'config pending → 0 spend requests', `${early}; "${waiting}"`);
  await page.waitForSelector('[data-spend-provider="openai"]', { timeout: 8000 });
  await page.waitForTimeout(500);
  const after = server.calls.filter((c) => c.path === '/api/admin/ai/spend').length;
  ck('FE4', after === 1, 'config in → exactly 1 spend request', `${after}`);
  const line = ((await page.locator('[data-spend-period]').textContent()) ?? '').trim();
  ck('FE4', line.endsWith('· days in Europe/Warsaw'), 'the period line names the zone the report counted in', line);

  server.spendDelayMs = 1500;
  await page.getByRole('radio', { name: 'last month' }).click();
  await page.waitForTimeout(400);
  const stale = await page.locator('[data-spend-provider]').count();
  ck('FE4', stale === 0, 'a new period shows no rows of the previous one while it loads', `rows on screen: ${stale}`);
  const ours = ((await page.locator('body').textContent()) ?? '').replace(/\s+/g, ' ');
  ck('FE4', !/our total · usd\s*12\.50/i.test(ours), 'nor the previous total');
  await page.waitForTimeout(1500);

  await mount({ start: '/ai-providers?view=spend', spendTz: 'UTC' });
  await page.waitForSelector('[data-spend-provider="openai"]', { timeout: 8000 });
  const other = ((await page.locator('body').textContent()) ?? '').replace(/\s+/g, ' ');
  ck('FE4', other.includes('days in UTC') && other.includes('the report counted its days in UTC, not Europe/Warsaw'), 'a report counted in another zone says so', other.slice(other.indexOf('days in'), other.indexOf('days in') + 120));
}

// ═══ E · EDGES ═════════════════════════════════════════════════════════════════════════════════
console.log('\nE · edges');
await mount();
await page.waitForSelector('[data-provider="openai"]', { timeout: 8000 });
{
  server.forceStale = true;
  const readsBefore = server.calls.filter((c) => c.method === 'GET' && c.path === '/api/admin/ai/providers').length;
  await row('openai').getByRole('switch').click();
  await page.waitForTimeout(900);
  const t = await toast();
  ck('E1', t.includes('reload — the config changed'), 'a stale refusal says "reload — the config changed"');
  const readsAfter = server.calls.filter((c) => c.method === 'GET' && c.path === '/api/admin/ai/providers').length;
  ck('E1', readsAfter > readsBefore, 'and the config is read again', `${readsBefore} → ${readsAfter}`);
  const back = await row('openai').getByRole('switch').getAttribute('aria-checked');
  ck('E1', back === 'true', 'the refused switch snaps back', `aria-checked=${back}`);
}
await mount();
await page.waitForSelector('[data-provider="openai"]', { timeout: 8000 });
{
  const SECRET = 'sk-probe-secret-7788';
  await openRow('openai');
  const field = page.getByLabel('OpenAI key', { exact: true });
  await field.fill(SECRET);
  await row('openai').getByRole('button', { name: 'save key' }).first().click();
  await page.waitForTimeout(800);
  const w = writes('PUT', /^\/api\/admin\/ai\/providers\/openai\/key$/);
  ck('E2', w.length === 1 && w[0].body.kind === 'api' && w[0].body.value === SECRET, 'save key → ONE PUT …/openai/key {kind:"api", value}', `writes: ${w.length}`);
  const t = await rowText('openai');
  ck('E2', t.includes('ok · balance 24.50 USD'), 'the probe answer stands inline under the key line', t.slice(0, 160));
  ck('E2', t.includes('key: set ···7788 · by im'), 'the key line now says set ···7788');
  const left = await field.inputValue().catch(() => '<gone>');
  ck('E2', left === '', 'the field is emptied once the key is stored', JSON.stringify(left));
  const html = await page.content();
  ck('E2', !html.includes(SECRET), 'the secret is nowhere in the page');
}
await mount({ masterKey: false });
await page.waitForSelector('[data-provider="openai"]', { timeout: 8000 });
{
  await openRow('openai');
  const t = await toast();
  ck('E3', t.includes('keys cannot be stored until AI_KEYS_MASTER_KEY is set on the server'), 'no master key → the warning callout');
  const disabled = await page.getByLabel('OpenAI key', { exact: true }).isDisabled();
  ck('E3', disabled, '…and the key field is off');
}
for (const env of ['', 'ab12']) {
  // google holds a stored key; once without an env key behind it, once with one.
  await mount({ env: env ? { google: env } : {} });
  await page.waitForSelector('[data-provider="google"]', { timeout: 8000 });
  await openRow('google');
  const keyWrites = () => writes('PUT', /^\/api\/admin\/ai\/providers\/google\/key$/);
  const clearBtn = () => row('google').getByRole('button', { name: 'clear the key', exact: true });
  if (!env) {
    const onEnv = await row('anthropic').getByRole('button', { name: /^clear/ }).count();
    ck('E5', (await clearBtn().count()) === 1 && onEnv === 0, '"clear" stands on a stored key only (google db: yes, anthropic env: no)', `google ${await clearBtn().count()}, anthropic ${onEnv}`);
    const clearLine = ((await row('google').locator('[data-key-line="api"]').textContent()) ?? '').replace(/\s+/g, ' ');
    ck('E5', clearLine.endsWith('· 27 sep · clear'), 'at the end of the key line', clearLine);
    await clearBtn().click();
    await page.waitForTimeout(300);
    const q = ((await row('google').locator('[data-key-confirm="api"]').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
    ck('E5', q.includes('clear the stored key? the env key, if any, takes over · yes / no') && keyWrites().length === 0, 'the line becomes the question; nothing is written yet', `${q} | writes ${keyWrites().length}`);
    const no = row('google').getByRole('button', { name: 'no', exact: true });
    if (await no.count()) await no.click();
    await page.waitForTimeout(300);
    const back = ((await row('google').locator('[data-key-line="api"]').textContent().catch(() => '')) ?? '');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    ck('E5', back.includes('key: set ···9f3c') && keyWrites().length === 0 && focused === 'clear the key', '"no" puts the line back, writes nothing, focus returns to "clear"', `focus=${focused}`);
    if (!(await clearBtn().count())) {
      ck('E5', false, '"clear" is gone after "no"');
      continue;
    }
    await clearBtn().click();
  } else {
    if (!(await clearBtn().count())) {
      ck('E5', false, '"clear" is on the stored key');
      continue;
    }
    await clearBtn().click();
  }
  await page.waitForTimeout(200);
  const yes = row('google').getByRole('button', { name: 'yes', exact: true });
  if (await yes.count()) await yes.click();
  await page.waitForTimeout(800);
  const w = keyWrites();
  ck('E5', w.length === 1 && w[0].body.kind === 'api' && w[0].body.value === '', '"yes" → exactly ONE PUT …/google/key {kind:"api", value:""}', JSON.stringify(w.map((c) => c.body)));
  const status = await row('google').getByRole('status').count();
  ck('E5', status === 0, 'no probe answer is drawn after a clear', `status lines: ${status}`);
  const after = ((await row('google').locator('[data-key-line="api"]').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
  const want = env ? `key: from env ···${env}` : 'key: not set';
  ck('E5', after === want, `the line follows the returned config: "${want}"`, after);
}
// FE1 · the key never outlives its request — not in the field, not in the mutation cache.
const secretsInCache = (secret) =>
  page.evaluate((s) => JSON.stringify(window.__qc.getMutationCache().getAll().map((m) => m.state.variables ?? null)).includes(s), secret);
{
  const SECRET = 'sk-probe-refused-4411';
  await mount({ failKey: true });
  await page.waitForSelector('[data-provider="openai"]', { timeout: 8000 });
  await openRow('openai');
  const field = page.getByLabel('OpenAI key', { exact: true });
  await field.fill(SECRET);
  await row('openai').getByRole('button', { name: 'save key' }).first().click();
  await page.waitForTimeout(900);
  const w = writes('PUT', /^\/api\/admin\/ai\/providers\/openai\/key$/);
  const left = await field.inputValue().catch(() => '<gone>');
  ck('FE1', w.length === 1 && left === '', 'a REFUSED save still empties the field', `writes ${w.length}, field ${JSON.stringify(left)}`);
  ck('FE1', !(await secretsInCache(SECRET)), 'no mutation in the cache holds the key after the refusal');
  const alert = ((await row('openai').getByRole('alert').first().textContent().catch(() => '')) ?? '').trim();
  ck('FE1', alert.includes('the provider refused this key'), 'the refusal stands under the field', alert);
  // The field's id is its name (ui/components/input sets `id={name}`).
  const focused = await page.evaluate(() => document.activeElement?.id);
  const invalid = await field.getAttribute('aria-invalid');
  ck('FE1', focused === 'ai-key-openai-api' && invalid === 'true', 'focus is back in the empty field, marked invalid', `focus=${focused} aria-invalid=${invalid}`);
  ck('FE1', !(await page.content()).includes(SECRET), 'the key is nowhere in the page');

  const OK = 'sk-probe-accepted-5522';
  await mount();
  await page.waitForSelector('[data-provider="openai"]', { timeout: 8000 });
  await openRow('openai');
  await page.getByLabel('OpenAI key', { exact: true }).fill(OK);
  await row('openai').getByRole('button', { name: 'save key' }).first().click();
  await page.waitForTimeout(900);
  ck('FE1', !(await secretsInCache(OK)), 'no mutation in the cache holds the key after a success either');
}

// The reconciliation slot clears the same way, as its own kind.
await mount({ patch: { openai: { adminKeySource: 'db', adminKeyLast4: 'ad01' } } });
await page.waitForSelector('[data-provider="openai"]', { timeout: 8000 });
{
  await openRow('openai');
  const door = row('openai').getByRole('button', { name: 'clear the reconciliation key', exact: true });
  const had = await door.count();
  if (had) await door.click();
  await page.waitForTimeout(200);
  const q = ((await row('openai').locator('[data-key-confirm="admin"]').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
  const yes = row('openai').getByRole('button', { name: 'yes', exact: true });
  if (await yes.count()) await yes.click();
  await page.waitForTimeout(800);
  const w = writes('PUT', /^\/api\/admin\/ai\/providers\/openai\/key$/);
  const line = ((await row('openai').locator('[data-key-line="admin"]').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
  ck(
    'E5',
    had === 1 && q.startsWith('clear the stored reconciliation key?') && w.length === 1 && w[0].body.kind === 'admin' && w[0].body.value === '' && line === 'reconciliation key (optional): not set',
    'the reconciliation key clears the same way: question, ONE PUT {kind:"admin", value:""}, "not set"',
    `door ${had} | ${q} | ${JSON.stringify(w.map((c) => c.body))} | ${line}`,
  );
}
await mount({ isSuper: false });
{
  await page.waitForTimeout(500);
  const loc = await page.evaluate(() => window.__loc);
  ck('E4', loc === '/me', 'a non-super account is sent to /me', loc);
  const asked = server.calls.some((c) => c.path.startsWith('/api/admin/ai/'));
  ck('E4', !asked, 'and the AI config is never asked for');
}

await browser.close();
console.log('');
if (chosen.length) {
  const expected = new Set(chosen.map((k) => MUTATIONS[k].red));
  const hit = [...expected].every((id) => failed.has(id));
  console.log(hit ? `MUTATION CAUGHT: ${[...expected].join(', ')} went red` : `MUTATION MISSED: expected ${[...expected].join(', ')} red, failed: ${[...failed].join(', ') || 'none'}`);
  process.exit(hit ? 1 : 3);
}
console.log(bad ? `${bad} FAILED` : 'ALL GREEN');
process.exit(bad ? 1 : 0);
