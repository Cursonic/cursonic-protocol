// Live board. Reads only the market-source record. No other record is consulted.
import { countTo, reduced } from './motion.js';

const COPY_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const DASH = '—';
const POLL = 60000;
const BACKOFF = 1500;

export function fmtPrice(n) {
  if (!isFinite(n)) return DASH;
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(4);
  if (n === 0) return '$0';
  const z = Math.max(0, -Math.floor(Math.log10(n)));
  return '$' + n.toFixed(Math.min(z + 3, 12));
}
export function fmtCompact(n) {
  if (!isFinite(n)) return DASH;
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}
export const fmtMove = (n) => (isFinite(n) ? `${n >= 0 ? '▲' : '▼'} ${Math.abs(n).toFixed(2)}%` : DASH);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function getJSON(url, signal) {
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('http ' + res.status);
  return res.json();
}

export async function loadBoard(rec, signal) {
  const base = rec.url.replace(/\/$/, '');
  const boosts = await getJSON(base + rec.paths.boosts, signal);
  const addrs = [...new Set((Array.isArray(boosts) ? boosts : []).filter((b) => b && b.chainId === 'solana' && b.tokenAddress).map((b) => b.tokenAddress))].slice(0, 30);
  if (!addrs.length) throw new Error('empty');
  const pairs = await getJSON(base + rec.paths.pairs + addrs.join(','), signal);
  const best = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    if (!p || p.chainId !== 'solana' || !p.baseToken) continue;
    const vol = Number(p.volume && p.volume.h24) || 0;
    const cur = best.get(p.baseToken.address);
    if (!cur || vol > cur.volume) {
      best.set(p.baseToken.address, {
        address: p.baseToken.address,
        symbol: p.baseToken.symbol || '?',
        name: p.baseToken.name || '',
        image: p.info && p.info.imageUrl ? p.info.imageUrl : '',
        price: Number(p.priceUsd),
        move: Number(p.priceChange && p.priceChange.h24),
        volume: vol,
        liquidity: Number(p.liquidity && p.liquidity.usd)
      });
    }
  }
  const list = [...best.values()].sort((a, b) => b.volume - a.volume).slice(0, 10);
  if (!list.length) throw new Error('empty');
  return list;
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((res) => {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); res();
  });
}

export function initMarket(register) {
  const rec = register.records.market;
  const rows = document.querySelector('[data-rows]');
  const track = document.querySelector('[data-track]');
  const err = document.querySelector('[data-error]');
  const pill = document.querySelector('[data-board-pill]');
  const pillText = document.querySelector('[data-board-status]');
  const heroPill = document.querySelector('.hero .pill');
  const heroText = document.querySelector('[data-status-text]');
  const refresh = document.querySelector('[data-refresh]');
  if (!rows) return;

  let data = null, fails = 0, timer = 0, ctrl = null, order = '';
  const cells = new Map();

  const skeleton = () => {
    rows.innerHTML = Array.from({ length: 10 }, () => '<div class="tr sk-row" aria-hidden="true"><span class="rank"><i class="sk" style="width:16px"></i></span><span class="tok"><i class="sk round"></i><i class="sk" style="width:60%"></i></span><span class="c-price"><i class="sk"></i></span><span class="c-move"><i class="sk"></i></span><span class="c-vol"><i class="sk"></i></span><span class="c-liq"><i class="sk"></i></span><span class="cp"></span></div>').join('');
  };
  const dashRows = () => {
    rows.innerHTML = Array.from({ length: 10 }, (_, i) => `<div class="tr data-row in"><span class="rank">${i + 1}</span><span class="tok"><i class="tok-i">${DASH}</i><span class="tok-t"><b>${DASH}</b></span></span><span class="num c-price">${DASH}</span><span class="num c-move">${DASH}</span><span class="num c-vol">${DASH}</span><span class="num c-liq">${DASH}</span><span class="cp"></span></div>`).join('');
  };
  const setStatus = (ok, msg) => {
    pillText.textContent = msg;
    pill.classList.toggle('is-warn', !ok);
    if (heroText) { heroText.textContent = ok ? 'Solana board streaming' : 'Board is retrying'; heroPill.classList.toggle('is-warn', !ok); }
  };

  function tile(t) {
    const i = document.createElement('span');
    i.className = 'tok-i';
    const letter = () => { i.textContent = (t.symbol || '?').trim().charAt(0).toUpperCase() || '?'; };
    if (t.image) {
      const im = new Image(); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
      im.onerror = () => { im.remove(); letter(); };
      im.src = t.image; i.appendChild(im);
    } else letter();
    return i;
  }

  function paint(list) {
    if (!cells.size) rows.innerHTML = '';
    const keep = new Set(list.map((t) => t.address));
    for (const [a, c] of cells) if (!keep.has(a)) { c.row.remove(); cells.delete(a); }
    list.forEach((t, idx) => {
      let c = cells.get(t.address);
      if (!c) {
        const row = document.createElement('div');
        row.className = 'tr data-row';
        row.innerHTML = `<span class="rank"></span><span class="tok"><span class="slot"></span><span class="tok-t"><b></b><small></small></span></span><span class="num c-price"></span><span class="num c-move"></span><span class="num c-vol"></span><span class="num c-liq"></span><span class="cp"><button class="copy" type="button" aria-label="Copy token address">${COPY_ICON}</button></span>`;
        row.querySelector('.slot').replaceWith(tile(t));
        row.querySelector('.copy').addEventListener('click', (e) => {
          const b = e.currentTarget;
          copyText(t.address).then(() => { b.classList.add('done'); b.setAttribute('aria-label', 'Copied'); setTimeout(() => { b.classList.remove('done'); b.setAttribute('aria-label', 'Copy token address'); }, 1400); });
        });
        c = { row, v: {}, el: { price: row.querySelector('.c-price'), move: row.querySelector('.c-move'), vol: row.querySelector('.c-vol'), liq: row.querySelector('.c-liq') } };
        cells.set(t.address, c);
        rows.appendChild(row);
        setTimeout(() => row.classList.add('in'), reduced ? 0 : 40 + idx * 55);
      }
      c.row.querySelector('.rank').textContent = idx + 1;
      c.row.querySelector('b').textContent = t.symbol;
      c.row.querySelector('small').textContent = t.name;
      const set = (k, val, fmt) => {
        const el = c.el[k], prev = c.v[k];
        if (prev === val) return;
        if (prev !== undefined && isFinite(prev) && isFinite(val)) {
          el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth;
          el.classList.add(val >= prev ? 'flash-up' : 'flash-dn');
        }
        countTo(isFinite(prev) ? prev : val, val, fmt, (s) => { el.textContent = s; });
        c.v[k] = val;
      };
      set('price', t.price, fmtPrice); set('vol', t.volume, fmtCompact); set('liq', t.liquidity, fmtCompact); set('move', t.move, fmtMove);
      c.el.move.classList.toggle('up', t.move >= 0); c.el.move.classList.toggle('dn', !(t.move >= 0));
    });
    list.forEach((t) => rows.appendChild(cells.get(t.address).row));
    ticker(list);
  }

  let tkKey = '';
  function ticker(list) {
    const key = list.map((t) => t.address).join();
    const item = (t) => `<span class="tk" data-a="${esc(t.address)}"><b>${esc(t.symbol)}</b><span>${fmtPrice(t.price)}</span><span class="${t.move >= 0 ? 'up' : 'dn'}">${fmtMove(t.move)}</span></span>`;
    if (key === tkKey) {
      for (const t of list) track.querySelectorAll(`[data-a="${CSS.escape(t.address)}"]`).forEach((n) => { n.children[1].textContent = fmtPrice(t.price); n.children[2].textContent = fmtMove(t.move); n.children[2].className = t.move >= 0 ? 'up' : 'dn'; });
      return;
    }
    tkKey = key;
    const html = list.map(item).join('');
    track.innerHTML = html + html;
  }

  const schedule = (ms) => { clearTimeout(timer); if (!document.hidden) timer = setTimeout(pull, ms); };

  async function pull() {
    clearTimeout(timer);
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    const mine = ctrl;
    const to = setTimeout(() => mine.abort(), 15000);
    try {
      if (!rec || rec.state !== 'stated' || !rec.url) throw new Error('no source');
      const list = await loadBoard(rec, mine.signal);
      data = list; fails = 0;
      err.hidden = true;
      paint(list);
      setStatus(true, 'Live feed, refreshes every minute');
      schedule(POLL);
    } catch (e) {
      if (mine !== ctrl) return;
      if (mine.signal.aborted && document.hidden) return;
      fails += 1;
      if (!data) { if (!cells.size) dashRows(); track.innerHTML = ''; tkKey = ''; }
      err.textContent = data ? 'Source silent. Last good numbers stay visible during retries.' : 'Market source silent. Retrying automatically.';
      err.hidden = false;
      setStatus(false, 'Retrying');
      schedule(Math.min(60000, BACKOFF * 2 ** (fails - 1)) + Math.random() * 500);
    } finally { clearTimeout(to); }
  }

  skeleton();
  setStatus(false, 'Connecting');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(timer); if (ctrl) ctrl.abort(); } else pull();
  });
  if (refresh) refresh.addEventListener('click', () => pull());
  if (!document.hidden) pull();
}
