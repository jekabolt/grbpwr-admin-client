#!/usr/bin/env node
// ONBOARDING S4 · THE GUIDED CREATE — live, in chromium, on the REAL tech card page.
// `scripts/guided-create-entry.tsx` mounts `page.tsx` under the app's two routes (/add-tech-card and
// /tech-cards/:id) over a stubbed network that keeps one server-side card per create key:
//   A · CREATE NEW (`?guided=1`), three fields given, the name typed + blurred → ONE CreateTechCard
//       (guided, with a request key) even with a second commit in the same tick; the address becomes
//       /tech-cards/:id?tab=studio&step=card by REPLACE (history length unchanged); the form is the
//       SAME mounted form (the name input is the same node) and a note typed while the create was in
//       flight survives; no `add`; roles unlock (the «once the card exists» line goes); the first
//       autosave claims the version the server holds (no 409)
//   B · the card footer `next · moodboard ›` on a complete form → one create, lands on step=mood
//   C · cold mount of /tech-cards/:id (F5) → the page gates (loading…) and seeds the form from the
//       server; walking to another card remounts the form (a new node)
//   D · exit: `show all blocks ›` on the rail → ExitTechCardGuide, the door goes, the rail is clickable
//   E · NEGATIVE CONTROL: /add-tech-card without `?guided=1` → `add` stays, a blur never creates, the
//       card footer is dead with «add the card first»
// Mutation: drop `&& !handedOff` from the loading gate in page.tsx → A's «same node» goes red.
//   node scripts/guided-create-probe.mjs  (needs `yarn build` for dist/assets/*.css)
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '..');

const EXPECTED = 32;
let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

const assets = resolve(root, 'dist/assets');
const cssFile = existsSync(assets) ? readdirSync(assets).find((f) => f.endsWith('.css')) : null;
if (!cssFile) {
  console.log('DID NOT RUN: dist/assets/*.css is missing — run `yarn build` first');
  process.exit(2);
}
const css = readFileSync(resolve(assets, cssFile), 'utf8');

function resolvePlaywright() {
  const npx = `${homedir()}/.npm/_npx`;
  if (!existsSync(npx)) return null;
  const found = execFileSync(
    'find',
    [npx, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
  for (const dir of found) if (existsSync(`${dir}/.local-browsers`)) return `${dir}/index.js`;
  return found[0] ? `${found[0]}/index.js` : null;
}
const pwPath = resolvePlaywright();
const pw = pwPath ? await import(pwPath) : null;
const chromium = pw?.chromium ?? pw?.default?.chromium;
if (!chromium) {
  console.log('DID NOT RUN: playwright not found');
  process.exit(2);
}

const stubNetwork = {
  name: 'stub-network',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `
        const nope = () => Promise.resolve({});
        window.__calls = [];
        export const adminService = new Proxy({}, { get: (_, name) => (body) => {
          window.__calls.push(String(name));
          const f = (window.__api || {})[String(name)];
          try { return Promise.resolve(f ? f(body) : {}); } catch (e) { return Promise.reject(e); }
        } });
        export const requestHandler = () => Promise.resolve({});
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        // M17 pulled the playground registry into the board: its Ideas read the abortable service.
        export const abortableAdminService = adminService;
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: root,
    }));
  },
};
const out = resolve(tmpdir(), `guided-create-${process.pid}.js`);
await build({
  entryPoints: [resolve(root, 'scripts/guided-create-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile: out,
  logLevel: 'error',
  absWorkingDir: root,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  plugins: [
    stubNetwork,
    {
      // Vite asset URLs (`?url`, `?raw`) the page pulls in through the care-label tab.
      name: 'stub-asset-urls',
      setup(b) {
        b.onResolve({ filter: /\?(url|raw|worker)$/ }, (a) => ({
          path: a.path,
          namespace: 'asset',
        }));
        b.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({
          contents: 'export default "";',
          loader: 'js',
        }));
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: Object.fromEntries(
    [
      'components',
      'lib',
      'api',
      'utils',
      'ui',
      'constants',
      'store',
      'hooks',
      'context',
      'types',
      'styles',
    ].map((a) => [a, resolve(root, 'src', a)]),
  ),
});
const bundle = readFileSync(out, 'utf8');
rmSync(out, { force: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });

  // The stubbed server: one card per create key, a lock version, the guide flag.
  await page.evaluate(() => {
    const S = (window.__srv = {
      cards: {},
      byKey: {},
      creates: [],
      updates: [],
      exits: [],
      seq: 4242,
    });
    const fail = (status, message) => Promise.reject(Object.assign(new Error(message), { status }));
    window.__createDelay = 0;
    window.__api = {
      GetCurrentAccount: () => ({ account: { isSuper: true } }),
      CreateTechCard: (b) => {
        S.creates.push({ key: b.clientRequestId, guided: b.guided, name: b.techCard?.name });
        let id = S.byKey[b.clientRequestId];
        if (!id) {
          id = S.seq++;
          if (b.clientRequestId) S.byKey[b.clientRequestId] = id;
          S.cards[id] = {
            id,
            techCard: b.techCard,
            lockVersion: 3,
            guided: !!b.guided,
            roleAssignments: [],
          };
        }
        return new Promise((r) => setTimeout(() => r({ id }), window.__createDelay));
      },
      GetTechCard: ({ id }) => {
        const c = S.cards[id];
        if (!c) return fail(404, 'not found');
        const out = { techCard: structuredClone(c) };
        return new Promise((r) => setTimeout(() => r(out), window.__readDelay ?? 0));
      },
      UpdateStyle: (b) => {
        S.styles = S.styles ?? [];
        S.styles.push(b?.styleId ?? b?.id ?? b?.techCardId ?? null);
        return S.styles.length === 1 && window.__failStyleOnce
          ? fail(500, 'style write failed')
          : {};
      },
      UpdateTechCard: ({ id, techCard, expectedLockVersion }) => {
        const c = S.cards[id];
        S.updates.push({ id, expectedLockVersion, held: c?.lockVersion, notes: techCard?.notes });
        if (!c) return fail(404, 'not found');
        if (expectedLockVersion !== c.lockVersion) return fail(409, 'lock version mismatch');
        c.lockVersion += 1;
        c.techCard = techCard;
        return {};
      },
      ExitTechCardGuide: ({ techCardId }) => {
        S.exits.push(techCardId);
        if (S.cards[techCardId]) S.cards[techCardId].guided = false;
        return {};
      },
      GetDesignBand: () => ({ bench: [], runs: [], totalRuns: 0 }),
    };
  });

  const three = { categoryId: 7, season: 'FW26', styleNumber: 'FW26-001' };
  const mount = async (url, defaults) => {
    await page.evaluate(([u, d]) => window.__st.mount(u, d), [url, defaults]);
    await page
      .waitForSelector('[data-step-footer="card"], [data-field="name"] input', { timeout: 15000 })
      .catch(async (e) => {
        console.log('DID NOT MOUNT', errors.join(' | ').slice(0, 800));
        console.log((await page.evaluate(() => document.body.innerText)).slice(0, 800));
        throw e;
      });
    await page.waitForTimeout(300);
  };
  const look = () =>
    page.evaluate(() => {
      const text = document.body.innerText;
      const btn = (t) =>
        [...document.querySelectorAll('button')].find(
          (b) =>
            b.checkVisibility() && b.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() === t,
        );
      const foot = document.querySelector('[data-step-footer="card"]');
      return {
        path: location.pathname + location.search,
        hist: history.length,
        add: !!btn('add'),
        rolesNote: text.includes('people are assigned once the card exists'),
        assign: [...document.querySelectorAll('button')].some(
          (b) => /assign/i.test(b.textContent ?? '') && b.checkVisibility(),
        ),
        footerDead: !!foot?.querySelector('[data-inert]'),
        footerReason: foot?.querySelector('[data-step-footer-reason]')?.textContent ?? '',
        exitDoor: !!document.querySelector('[data-exit-guide]'),
        loading: text.includes('loading tech card'),
        nameValue: document.querySelector('[data-field="name"] input')?.value,
        notes: document.querySelector('[data-field="notes"] textarea')?.value,
        srv: structuredClone(window.__srv),
      };
    });

  // ── A ─────────────────────────────────────────────────────────────────────────────────────
  console.log('\nA · CREATE NEW, three fields given, the name typed and blurred');
  await mount('/add-tech-card?guided=1', three);
  let v = await look();
  const hist0 = v.hist;
  ck(!v.add, 'no `add` on the guided path');
  ck(v.rolesNote, 'roles say «once the card exists» before the id');
  if (process.env.DEBUG) {
    console.log(
      await page.evaluate(() =>
        JSON.stringify({
          inputs: [...document.querySelectorAll('input,textarea')]
            .map((i) => i.name || i.getAttribute('aria-label'))
            .slice(0, 40),
          text: document.body.innerText.slice(0, 1500),
        }),
      ),
    );
    console.log(errors.join(' | ').slice(0, 1500));
  }
  await page.evaluate(() => {
    window.__nameNode = document.querySelector('[data-field="name"] input');
  });
  await page.evaluate(() => (window.__createDelay = 400));
  await page.fill('[data-field="name"] input', 'field coat');
  // Two commits in ONE tick: the blur of the name and of the style number.
  await page.evaluate(() => {
    document
      .querySelector('[data-field="name"] input')
      .dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    document
      .querySelector('[data-field="styleNumber"] input')
      ?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  await page.waitForTimeout(80);
  // Typed while the create is on the wire.
  await page.fill('[data-field="notes"] textarea', 'typed in flight');
  await page
    .waitForFunction(() => location.pathname.startsWith('/tech-cards/'), null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(600);
  v = await look();
  ck(
    v.srv.creates.length === 1,
    'ONE CreateTechCard for two commits',
    JSON.stringify(v.srv.creates),
  );
  ck(
    v.srv.creates[0]?.guided === true && !!v.srv.creates[0]?.key,
    'created guided, with a request key',
  );
  ck(
    /^\/tech-cards\/4242\?tab=studio&step=card$/.test(v.path),
    'lands on /tech-cards/:id?tab=studio&step=card',
    v.path,
  );
  ck(v.hist === hist0, 'by replace — Back leaves the card', `${hist0} → ${v.hist}`);
  ck(
    await page.evaluate(
      () => document.querySelector('[data-field="name"] input') === window.__nameNode,
    ),
    'the SAME form — no remount',
  );
  ck(
    v.nameValue === 'field coat' && v.notes === 'typed in flight',
    'the note typed in flight survives',
    JSON.stringify({ n: v.nameValue, t: v.notes }),
  );
  ck(!v.rolesNote, 'roles unlock once the id exists');
  ck(!v.add, 'still no `add`');
  ck(v.exitDoor, '`show all blocks ›` on the rail of a guided card');
  const laterDead = () =>
    page.evaluate(() => ({
      dead: document.querySelectorAll('div[data-state="later"]').length,
      live: document.querySelectorAll('button[data-state="later"]').length,
    }));
  const guidedRail = await laterDead();
  ck(
    guidedRail.dead > 0 && guidedRail.live === 0,
    'guided: `later` cells are not doors',
    JSON.stringify(guidedRail),
  );
  // The first autosave carries the in-flight note under the server's version.
  await page
    .waitForFunction(() => window.__srv.updates.length > 0, null, { timeout: 12000 })
    .catch(() => {});
  v = await look();
  const u = v.srv.updates[0];
  ck(
    !!u && u.expectedLockVersion === u.held && u.held >= 3,
    'first autosave claims the server version (no 409)',
    JSON.stringify(v.srv.updates),
  );
  ck(u?.notes === 'typed in flight', 'and carries the note typed in flight', String(u?.notes));

  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}/guided-card.png`, fullPage: true });
  // ── D (on the same card) ───────────────────────────────────────────────────────────────────
  console.log('\nD · exit the guide');
  await page.click('[data-exit-guide]');
  await page.waitForTimeout(800);
  v = await look();
  ck(v.srv.exits.length === 1, 'ExitTechCardGuide called once', JSON.stringify(v.srv.exits));
  ck(!v.exitDoor, 'the door goes once the card is not guided');
  const plainRail = await laterDead();
  ck(
    plainRail.dead === 0 && plainRail.live > 0,
    'after exit every `later` cell is a door',
    JSON.stringify(plainRail),
  );

  // ── C ─────────────────────────────────────────────────────────────────────────────────────
  console.log('\nC · cold mount (F5) and walking to another card');
  await page.evaluate(() => {
    const c = structuredClone(window.__srv.cards[4242]);
    window.__srv.cards[777] = { ...c, id: 777, techCard: { ...c.techCard, name: 'other card' } };
  });
  await page.evaluate(() => (window.__readDelay = 400));
  await page.evaluate(() => window.__st.mount('/tech-cards/4242?tab=studio&step=card'));
  await page.waitForTimeout(50);
  const sawLoading = await page.evaluate(() =>
    document.body.innerText.includes('loading tech card'),
  );
  await page.evaluate(() => (window.__readDelay = 0));
  await page.waitForSelector('[data-field="name"] input', { timeout: 10000 });
  await page.waitForTimeout(300);
  v = await look();
  ck(sawLoading, 'a cold mount goes through the loading gate');
  ck(v.nameValue === 'field coat', 'and seeds the form from the server', String(v.nameValue));
  await page.evaluate(
    () => (window.__nameNode = document.querySelector('[data-field="name"] input')),
  );
  await page.evaluate(() => window.__st.go('/tech-cards/777?tab=studio&step=card'));
  await page
    .waitForFunction(
      () => document.querySelector('[data-field="name"] input')?.value === 'other card',
      null,
      { timeout: 8000 },
    )
    .catch(() => {});
  v = await look();
  ck(v.nameValue === 'other card', 'another card shows its own values', String(v.nameValue));
  ck(
    await page.evaluate(
      () => document.querySelector('[data-field="name"] input') !== window.__nameNode,
    ),
    'another card remounts the form',
  );

  // ── B ─────────────────────────────────────────────────────────────────────────────────────
  console.log('\nB · the card footer creates and lands on MOODBOARD');
  await page.evaluate(() => (window.__createDelay = 0));
  const before = (await look()).srv.creates.length;
  await mount('/add-tech-card?guided=1', { ...three, name: 'footer coat' });
  v = await look();
  ck(!v.footerDead, 'the footer is live on a complete form', v.footerReason);
  await page.click('[data-step-footer="card"] button');
  await page
    .waitForFunction(() => location.pathname.startsWith('/tech-cards/'), null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  v = await look();
  ck(
    v.srv.creates.length === before + 1,
    'one create from the footer',
    String(v.srv.creates.length - before),
  );
  ck(/step=mood$/.test(v.path), 'lands on step=mood', v.path);

  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}/guided-mood.png`, fullPage: false });
  // ── E ─────────────────────────────────────────────────────────────────────────────────────
  console.log('\nE · NEGATIVE CONTROL — /add-tech-card without ?guided=1');
  const before2 = v.srv.creates.length;
  await mount('/add-tech-card', three);
  await page.fill('[data-field="name"] input', 'plain coat');
  await page.evaluate(() =>
    document
      .querySelector('[data-field="name"] input')
      .dispatchEvent(new FocusEvent('focusout', { bubbles: true })),
  );
  await page.waitForTimeout(600);
  v = await look();
  ck(v.add, '`add` stays');
  ck(
    v.srv.creates.length === before2,
    'a blur never creates',
    String(v.srv.creates.length - before2),
  );
  ck(
    v.footerDead && /add the card first/.test(v.footerReason),
    'the card footer is dead: «add the card first»',
    v.footerReason,
  );
  ck(v.path === '/add-tech-card', 'stays on /add-tech-card', v.path);

  // ── F ─────────────────────────────────────────────────────────────────────────────────────
  console.log('\nF · a staged style fact fails at create → retried through the UPDATE path');
  await page.evaluate(() => {
    window.__failStyleOnce = true;
    window.__srv.styles = [];
  });
  const before3 = (await look()).srv.creates.length;
  await mount('/add-tech-card?guided=1', { ...three, styleNumber: 'FW26-077' });
  await page.fill('[data-field="brand"] input', 'other brand');
  await page.fill('[data-field="name"] input', 'brand coat');
  await page.evaluate(() =>
    document
      .querySelector('[data-field="name"] input')
      .dispatchEvent(new FocusEvent('focusout', { bubbles: true })),
  );
  await page
    .waitForFunction(() => location.pathname.startsWith('/tech-cards/'), null, { timeout: 8000 })
    .catch(() => {});
  const banner = await page.evaluate(() =>
    document.body.innerText.includes('is still staged and is saved again'),
  );
  await page
    .waitForFunction(() => (window.__srv.styles ?? []).length >= 2, null, { timeout: 12000 })
    .catch(() => {});
  v = await look();
  ck(v.srv.creates.length === before3 + 1, 'one create', String(v.srv.creates.length - before3));
  ck(banner, 'the failure is said: «… is still staged and is saved again …»');
  ck(
    (v.srv.styles ?? []).length >= 2,
    'the style write is retried on the created card',
    JSON.stringify(v.srv.styles),
  );
  ck(v.srv.creates.length === before3 + 1, 'the retry did not mint a second card');

  if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | ').slice(0, 800));
} finally {
  await browser.close();
}
console.log(`\nguided-create: ${total - bad}/${total} passed`);
process.exit(bad || total !== EXPECTED ? 1 : 0);
