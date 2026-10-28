import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATES, isLive, project, projectAll, scanAddresses, renderSocial, renderCA } from '../src/js/register.js';
import { renderPage } from './render.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => join(root, ...p);
const read = (p) => readFileSync(p, 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));
function walk(dir, skip = []) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (skip.includes(n)) continue;
    const f = join(dir, n);
    statSync(f).isDirectory() ? out.push(...walk(f, skip)) : out.push(f);
  }
  return out;
}
const textExt = /\.(html|css|js|mjs|json|md|svg|txt|py)$/i;

const register = JSON.parse(read(P('register.json')));
const tokens = read(P('src', 'tokens.css'));
const template = read(P('src', 'index.html'));
const distOk = existsSync(P('dist', 'index.html'));
const distHtml = distOk ? read(P('dist', 'index.html')) : '';
const distFiles = walk(P('dist'));
const distText = distFiles.filter((f) => textExt.test(f)).map((f) => read(f)).join('\n');

const gates = [];
const gate = (name, fn) => gates.push({ name, fn });

// ---- register -------------------------------------------------------------
gate('register: every record has a valid state', () => {
  for (const [k, r] of Object.entries(register.records)) if (!STATES.includes(r.state)) throw new Error(`${k}: bad state ${r.state}`);
});
gate('register: absent/unconfirmed records carry no value or url', () => {
  for (const [k, r] of Object.entries(register.records)) {
    if (r.state === 'stated') continue;
    for (const f of ['value', 'url', 'paths', 'handle', 'href']) if (f in r) throw new Error(`${k} is ${r.state} but has ${f}`);
  }
});
gate('register: projection strips dates and inert fields', () => {
  const pr = projectAll(register);
  for (const [k, r] of Object.entries(register.records)) {
    const p = pr[k];
    if ('checked' in p) throw new Error(k + ' projection leaks a date field');
    if (!isLive(r) && Object.keys(p).sort().join() !== 'label,state') throw new Error(k + ' inert projection has extras');
  }
});
gate('register: embedded JSON in dist matches the projection', () => {
  const m = /<script id="register" type="application\/json">([\s\S]*?)<\/script>/.exec(distHtml);
  if (!m) throw new Error('no embedded register');
  const got = JSON.parse(m[1].replace(/\\u003c/g, '<'));
  if (JSON.stringify(got) !== JSON.stringify({ records: projectAll(register) })) throw new Error('embedded register differs from register.json projection');
});

// ---- render branches: both live from day one ------------------------------
const rendered = renderPage(template, register, tokens);
gate('render: dist/index.html equals a fresh render of the register', () => {
  if (rendered !== distHtml) throw new Error('dist is stale, run npm run build');
});
gate('links: no href for any unstated social record', () => {
  for (const key of ['x', 'github']) {
    const r = register.records[key];
    const html = renderSocial(key, r);
    const hasHref = /href=/.test(html);
    if (isLive(r) && r.url && !hasHref) throw new Error(key + ' stated but has no href');
    if (!(isLive(r) && r.url) && hasHref) throw new Error(key + ' unstated but has href');
  }
  const slots = [...distHtml.matchAll(/data-slot="(x|github)"[^>]*>/g)].map((m) => m[0]);
  if (slots.length !== 2) throw new Error('expected 2 social slots, found ' + slots.length);
});
gate('ca slot: inert until stated, no value in inert markup', () => {
  const r = register.records.ca;
  const html = renderCA(r);
  if (!isLive(r) && (/data-ca=/.test(html) || /<button/.test(html))) throw new Error('inert CA carries value or button');
  if (isLive(r) && !html.includes(r.value)) throw new Error('stated CA missing value');
});

const synth = {
  ca: { value: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin' },
  x: { url: 'https://x.com/cursonic_probe' },
  github: { url: 'https://github.com/cursonic-probe/app' }
};
// Mutation anchors read the current record at runtime and flip it, whatever its state is.
function flip(reg, key) {
  const r = reg.records[key];
  if (isLive(r)) { for (const f of ['value', 'url']) delete r[f]; r.state = 'absent'; return 'to-inert'; }
  Object.assign(r, synth[key]); r.state = 'stated'; return 'to-stated';
}
const branchHits = { stated: 0, inert: 0 };
gate('mutation: flipping each of ca, x, github renders the opposite branch', () => {
  for (const key of ['ca', 'x', 'github']) {
    const before = JSON.stringify(register);
    const m = clone(register);
    const dir = flip(m, key);
    const html = renderPage(template, m, tokens);
    const slot = key === 'ca' ? /class="ca-slot[^"]*"[^>]*>/.exec(html)[0] : new RegExp(`data-slot="${key}"[^>]*>`).exec(html)[0];
    const tag = key === 'ca' ? slot : html.slice(html.lastIndexOf('<', html.indexOf(slot)), html.indexOf(slot) + slot.length);
    const now = isLive(m.records[key]);
    if (dir === 'to-stated') {
      branchHits.stated++;
      if (key === 'ca' ? !html.includes(synth.ca.value) || !/is-live/.test(slot) : !/href="/.test(tag)) throw new Error(key + ' stated branch failed');
    } else {
      branchHits.inert++;
      if (key === 'ca' ? html.includes('data-ca=') : /href=/.test(tag)) throw new Error(key + ' inert branch failed');
    }
    if (now === isLive(register.records[key])) throw new Error(key + ' state did not flip');
    if (before !== JSON.stringify(register)) throw new Error('mutation leaked into the live register');
  }
});
gate('mutation: both gate branches were exercised (stated and inert)', () => {
  // current states supply one branch; the flip supplies the other. Prove both rendered at least once overall.
  const cur = Object.keys(synth).map((k) => isLive(register.records[k]));
  const hasStated = branchHits.stated > 0 || cur.some(Boolean);
  const hasInert = branchHits.inert > 0 || cur.some((x) => !x);
  if (!hasStated || !hasInert) throw new Error('a branch was never exercised');
});
gate('mutation: stated records never reach the inert projection and inert never reach stated', () => {
  const m = clone(register);
  for (const k of Object.keys(synth)) flip(m, k);
  for (const k of Object.keys(synth)) {
    const p = project(m.records[k]);
    if (isLive(m.records[k]) && !(p.value || p.url)) throw new Error(k + ' lost its value');
    if (!isLive(m.records[k]) && (p.value || p.url)) throw new Error(k + ' inert kept a value');
  }
});

// ---- address scanner ------------------------------------------------------
gate('scanner: dist holds no address-shaped string outside the stated registry', () => {
  const bad = scanAddresses(distText, register);
  if (bad.length) throw new Error('unregistered address-shaped strings: ' + bad.slice(0, 3).join(', '));
});
gate('scanner: 0x hex is matched against the registry, not blanket-rejected', () => {
  const hex = '0x' + 'ab12'.repeat(10);
  const m = clone(register);
  const ca = m.records.ca;
  if (!isLive(ca)) { ca.state = 'stated'; delete ca.checked; }
  ca.value = hex;
  if (scanAddresses(`see ${hex}`, m).length) throw new Error('stated 0x address was rejected');
  ca.state = 'absent'; delete ca.value;
  if (scanAddresses(`see ${hex}`, m).length !== 1) throw new Error('unregistered 0x address slipped through');
});
gate('scanner: stated CA is exempt, unregistered base58 is caught', () => {
  const m = clone(register); flip(m, 'ca');
  const stated = isLive(m.records.ca) ? m.records.ca.value : synth.ca.value;
  if (!isLive(m.records.ca)) { m.records.ca.state = 'stated'; m.records.ca.value = stated; }
  if (scanAddresses(`ca ${stated}`, m).length) throw new Error('stated CA flagged');
  if (scanAddresses('x 7Zc2Hq9Lk4Mv8Nw3Pb6Rt1Yd5Xe2Fa9GhJkLm4', m).length !== 1) throw new Error('foreign address not flagged');
});

// ---- assets ---------------------------------------------------------------
gate('dist: required files exist, repo docs are not shipped', () => {
  for (const f of ['index.html', 'styles.css', 'favicon.svg', 'assets/logo-512.png', 'assets/logo-192.png', 'assets/logo-64.png', 'js/main.js', 'js/market.js']) if (!existsSync(P('dist', f))) throw new Error('missing dist/' + f);
  for (const f of distFiles.map((x) => relative(P('dist'), x).split(sep).join('/'))) if (/^(readme|license|register\.json|docs\/)/i.test(f)) throw new Error('repo file shipped: ' + f);
});
gate('logo: index.html references the copied logo with relative paths', () => {
  const refs = [...distHtml.matchAll(/(?:src|href)="(assets\/logo-\d+\.png)"/g)].map((m) => m[1]);
  if (!refs.includes('assets/logo-512.png') || !refs.includes('assets/logo-64.png')) throw new Error('logo refs missing');
  for (const r of new Set(refs)) {
    if (!existsSync(P('dist', r))) throw new Error('dist missing ' + r);
    const b = readFileSync(P('dist', r));
    if (b.subarray(1, 4).toString() !== 'PNG') throw new Error(r + ' is not a PNG');
    if (b[25] !== 6) throw new Error(r + ' lost its alpha channel');
  }
  if (/(?:src|href)="\/(?!\/)/.test(distHtml)) throw new Error('root-absolute path in html');
});
gate('logo: build script copies the logo explicitly', () => {
  const b = read(P('scripts', 'build.mjs'));
  for (const f of ['logo-512.png', 'logo-192.png', 'logo-64.png', 'favicon.svg']) if (!b.includes(f)) throw new Error('build.mjs does not name ' + f);
});
gate('favicon: 32x32 SVG, no comments, no double hyphen', () => {
  const s = read(P('dist', 'favicon.svg'));
  if (!/width="32" height="32" viewBox="0 0 32 32"/.test(s)) throw new Error('not 32x32');
  if (s.includes('<!--') || s.includes('--')) throw new Error('comment or double hyphen');
  if (!/<path[^>]+ d="M/.test(s)) throw new Error('no traced path');
});
gate('social: both official icons rendered at every breakpoint', () => {
  if (!distHtml.includes('M18.244 2.25h3.308')) throw new Error('X mark missing');
  if (!distHtml.includes('M8 0c4.42 0 8 3.58 8 8')) throw new Error('GitHub Octicon missing');
  const css = read(P('dist', 'styles.css'));
  if (/(\.socials|\.icon-btn|data-slot)[^{}]*\{[^}]*display:\s*none/.test(css.replace(/\.menu-btn\{display:none\}/g, ''))) throw new Error('social hidden by css');
  const end = /<div class="bar-end">([\s\S]*?)<button class="icon-btn menu-btn"/.exec(distHtml);
  if (!end || !/data-slot="x"/.test(end[1]) || !/data-slot="github"/.test(end[1])) throw new Error('socials not in the top-right group');
  if (/>\s*(X|GitHub)\s*</.test(end[1])) throw new Error('social text label present');
});

// ---- palette --------------------------------------------------------------
gate('palette: colour literals live only in tokens.css', () => {
  const lit = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklch|oklab)\(/;
  const files = [...walk(P('src')), P('scripts', 'render.mjs'), P('scripts', 'build.mjs')].filter((f) => textExt.test(f) && !f.endsWith('tokens.css') && !f.endsWith('.svg'));
  for (const f of files) {
    const t = read(f).replace(/&#\d+;/g, '').replace(/href="#[a-z-]+"/g, '').replace(/\(["']#["']\)|'#'/g, '');
    const m = lit.exec(t.replace(/\{\{[A-Z_]+\}\}/g, ''));
    if (m) throw new Error(`${relative(root, f)} has literal ${m[0]}`);
  }
});
gate('palette: each token is a sampled pixel recorded in scripts/palette.json', () => {
  const pal = JSON.parse(read(P('scripts', 'palette.json')));
  const lines = tokens.split('\n').filter((l) => /--[\w-]+:\s*#[0-9a-f]{6};/i.test(l));
  if (!lines.length) throw new Error('no tokens');
  for (const l of lines) {
    const hex = /#[0-9a-f]{6}/i.exec(l)[0].toLowerCase();
    const hit = pal.find((p) => p.hex.toLowerCase() === hex);
    if (!hit) throw new Error(hex + ' not in palette.json');
    if (!new RegExp(`\\(${hit.x},${hit.y}\\)`).test(l)) throw new Error(`${hex} comment lacks pixel (${hit.x},${hit.y})`);
  }
});

// ---- dates ----------------------------------------------------------------
gate('dates: zero dates, timestamps or clock strings anywhere in dist', () => {
  const pats = [/\b(?:19|20)\d{2}\b/, /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/, /\b\d{1,2}:\d{2}\b/, /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s+\d/i, /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, /\bas of\b|\bchecked\b|\btimestamp\b|\blast updated\b|\bupdated\b/i, /\b\d+\s*(?:am|pm)\b/i];
  const html = distHtml.replace(/<script id="register"[\s\S]*?<\/script>/, '').replace(/\sd="[^"]*"/g, '');
  for (const f of [html, ...distFiles.filter((x) => /\.(css|js)$/.test(x)).map((x) => read(x).replace(/\sd="[^"]*"/g, ''))]) for (const p of pats) { const m = p.exec(f); if (m) throw new Error('found ' + m[0]); }
});

// ---- css / motion / mobile ------------------------------------------------
gate('css: no ch units, tap token is 44px, reduced-motion fallback present', () => {
  const css = read(P('dist', 'styles.css'));
  if (/\d(?:\.\d+)?ch\b/.test(css)) throw new Error('ch unit used');
  if (!/--tap:\s*44px/.test(css)) throw new Error('tap token missing');
  if (!/prefers-reduced-motion:\s*reduce/.test(css)) throw new Error('no reduced-motion block');
  if (!/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(read(P('dist', 'js', 'motion.js')))) throw new Error('js ignores reduced motion');
});

// ---- market ---------------------------------------------------------------
gate('market: endpoints match the register record and ignore every other record', () => {
  const m = register.records.market;
  if (m.url + m.paths.boosts !== 'https://api.dexscreener.com/token-boosts/top/v1') throw new Error('boost endpoint differs');
  if (m.url + m.paths.pairs !== 'https://api.dexscreener.com/tokens/v1/solana/') throw new Error('pairs endpoint differs');
  const js = read(P('dist', 'js', 'market.js'));
  if (/records\.(?:ca|x|github|chain|rpc)\b|records\[/.test(js)) throw new Error('market reads a record other than its own');
  if (/from '\.\/register\.js'/.test(js)) throw new Error('market imports the register helpers');
  if (/api\.dexscreener\.com/.test(js)) throw new Error('endpoint hard-coded outside the register');
});
gate('market: poll 60s, hidden-tab pause, backoff, last-good data, letter tile', () => {
  const js = read(P('dist', 'js', 'market.js'));
  for (const [re, why] of [[/POLL = 60000/, 'poll'], [/visibilitychange/, 'visibility'], [/document\.hidden/, 'hidden'], [/BACKOFF \* 2 \*\* \(fails - 1\)/, 'backoff'], [/Last good numbers stay visible/, 'last good'], [/AbortController/, 'abort'], [/imageUrl/, 'imageUrl'], [/onerror/, 'tile fallback'], [/charAt\(0\)/, 'letter tile'], [/slice\(0, 10\)/, 'top 10'], [/volume/, 'volume sort']]) if (!re.test(js)) throw new Error('missing ' + why);
});

// ---- repo -----------------------------------------------------------------
gate('repo: README, whitepaper and MIT licence exist outside dist', () => {
  for (const f of ['README.md', 'docs/whitepaper.md', 'LICENSE']) if (!existsSync(P(f))) throw new Error('missing ' + f);
  const lic = read(P('LICENSE'));
  if (!/MIT License/.test(lic) || !/Copyright \(c\) 2026 Cursonic/.test(lic)) throw new Error('licence text wrong');
});
gate('repo hygiene: no tool config, no attribution, no model-vendor words', () => {
  if (existsSync(P('CLAU' + 'DE.md')) || existsSync(P('.cla' + 'ude'))) throw new Error('tool config present');
  const words = new RegExp(['\\bcl' + 'aude\\b', '\\bant' + 'hropic\\b', '\\bA' + 'I\\b', 'co-auth' + 'ored', 'generated (?:by|with)', '\\bgp' + 't\\b', '\\bll' + 'm\\b'].join('|'), 'i');
  const files = walk(root, ['node_modules', 'brand', 'reference', 'fixtures', 'dist']).filter((f) => textExt.test(f));
  files.push(...walk(P('dist')).filter((f) => textExt.test(f)));
  for (const f of files) {
    const t = read(f);
    const m = words.exec(t);
    if (m) throw new Error(`${relative(root, f)} contains "${m[0]}"`);
  }
});

// ---- copy -----------------------------------------------------------------
gate('copy: zero shared 2-grams with the reference corpus', () => {
  const corpus = read(P('scripts', 'fixtures', 'ref-corpus.txt'));
  const tok = (s) => s.toLowerCase().replace(/&[a-z#0-9]+;/g, ' ').match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
  const grams = (w) => { const g = new Set(); for (let i = 0; i < w.length - 1; i++) g.add(w[i] + ' ' + w[i + 1]); return g; };
  const ref = grams(tok(corpus));
  const body = distHtml.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  const segs = [];
  for (const m of body.matchAll(/>([^<>]+)</g)) segs.push(m[1]);
  for (const m of body.matchAll(/(?:aria-label|alt|title|content)="([^"]*)"/g)) segs.push(m[1]);
  for (const f of distFiles.filter((x) => x.endsWith('.js'))) for (const m of read(f).matchAll(/(['`])((?:\\.|(?!\1)[^\\\n])*?)\1/g)) if (/\s/.test(m[2]) && /[a-z]{3}/i.test(m[2]) && !/[<{}=;]/.test(m[2].replace(/\$\{[^}]*\}/g, ''))) segs.push(m[2]);
  const hits = new Set();
  for (const s of segs) for (const g of grams(tok(s))) if (ref.has(g)) hits.add(g);
  if (hits.size) throw new Error(`${hits.size} shared: ` + [...hits].slice(0, 400).join(' | '));
});

// ---- run ------------------------------------------------------------------
let failed = 0;
gates.forEach((g, i) => {
  const tag = `[${String(i + 1).padStart(2, '0')}/${gates.length}]`;
  try { g.fn(); console.log(`${tag} PASS ${g.name}`); }
  catch (e) { failed++; console.log(`${tag} FAIL ${g.name}\n        ${e.message}`); }
});
console.log(`\ngates: ${gates.length - failed}/${gates.length} passed`);
process.exit(failed ? 1 : 0);
