// Small interactions: menu, copy slot, record chips, job tabs.
const copy = (text) => (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard')));

export function initMenu() {
  const btn = document.querySelector('.menu-btn');
  const drawer = document.getElementById('drawer');
  if (!btn || !drawer) return;
  const set = (open) => { drawer.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(drawer.hidden));
  drawer.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  matchMedia('(min-width:900px)').addEventListener('change', () => set(false));
}

export function initCA() {
  const el = document.querySelector('.ca-slot.is-live');
  if (!el) return;
  const act = el.querySelector('.ca-act');
  let t = 0;
  el.addEventListener('click', async () => {
    try { await copy(el.dataset.ca); } catch {
      const r = document.createRange(); r.selectNodeContents(el.querySelector('.ca-value'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      try { document.execCommand('copy'); } catch {}
    }
    act.dataset.copyState = 'done'; el.setAttribute('aria-label', 'Copied');
    clearTimeout(t); t = setTimeout(() => { act.dataset.copyState = 'idle'; el.setAttribute('aria-label', 'Copy contract address'); }, 1600);
  });
}

// Fill the rails strip from the projected register. Inert records show a pending label only.
export function initRecords(register) {
  document.querySelectorAll('[data-record]').forEach((b) => {
    const r = register.records[b.dataset.record];
    if (r && r.state === 'stated') {
      let v = r.value || '';
      if (/^https?:/.test(v)) { try { v = new URL(v).host; } catch {} }
      b.textContent = b.dataset.record === 'ca' ? 'inside the top bar' : v;
    } else { b.textContent = 'pending'; b.classList.add('is-pending'); }
  });
}

const JOBS = [
  { name: 'Dispatcher', body: 'Sorts pending decisions, identifies the blocker per thread, drafts every reply. Zero messages leave without approval.', runs: 'Looping', uses: 'Mail, calendar', msgs: [['in', 'Four threads stalled. Top one awaits promised security notes, never delivered.'], ['in', 'Drafts ready, notes attached. Every message held.'], ['out', 'Release them.']] },
  { name: 'Scout', body: 'Sweeps fresh listings, flags matches against filters, one-line rationale apiece.', runs: 'Every sweep', uses: 'Board feed, browser', msgs: [['in', 'Five new pairs cleared your liquidity floor. Two show thin books.'], ['in', 'Shortlist saved. Give the word, deeper digging follows.'], ['out', 'Investigate the leading pair.']] },
  { name: 'Ledger', body: 'Matches payments against invoices, spots gaps, writes one nudge per overdue item.', runs: 'Each hour', uses: 'Spreadsheet, mail', msgs: [['in', 'Three invoices are overdue. One customer already paid twice.'], ['in', 'Reminders drafted for two. Refund note pending your review.'], ['out', 'Send the reminders only.']] },
  { name: 'Sentinel', body: 'Monitors listed wallets and endpoints, flagging any broken pattern.', runs: 'Constant', uses: 'RPC, webhooks', msgs: [['in', 'A watched wallet moved a large balance out in one hop.'], ['in', 'No other watched address followed. Logged, and staying alert.'], ['out', 'Alert me upon the following move.']] },
  { name: 'Courier', body: 'Turns notes into messages, queues them, and sends only on approval.', runs: 'On request', uses: 'Chat, mail', msgs: [['in', 'Three drafts are queued, with tone matched per recipient.'], ['in', 'One names a deadline you may want to soften.'], ['out', 'Soften it, then send.']] },
  { name: 'Fixer', body: 'Reads a failing report, recreates the crash, proposes a patch via branch for review.', runs: 'Per ticket', uses: 'Code host, terminal', msgs: [['in', 'Crash reproduced. Root cause: unchecked empty list.'], ['in', 'Patch plus test reside within a branch. Review whenever ready.'], ['out', 'Open the review.']] },
  { name: 'Rival watch', body: 'Follows rival public pages, reporting notable shifts ranked by impact.', runs: 'Each sweep', uses: 'Browser', msgs: [['in', 'One rival rewrote its entry offer and dropped a feature.'], ['in', 'Brief saved alongside before-and-after captures.'], ['out', 'Forward everything to teammates.']] },
  { name: 'Growth', body: 'Audits pages, proposes edits, measures results after approval.', runs: 'Each cycle', uses: 'Browser, files', msgs: [['in', 'Six pages share one weak headline. Rewrites are ready.'], ['in', 'I will compare engagement after you publish the first.'], ['out', 'Publish the first one.']] }
];

export function initJobs() {
  const tabs = document.querySelector('[data-tabs]');
  const panel = document.querySelector('[data-panel]');
  if (!tabs || !panel) return;
  const show = (i) => {
    const j = JOBS[i];
    tabs.querySelectorAll('[role="tab"]').forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    panel.innerHTML = `<div class="jp-info"><h3>${j.name}</h3><p>${j.body}</p><div class="meta"><div><span>Runs</span><b>${j.runs}</b></div><div><span>Uses</span><b>${j.uses}</b></div></div></div><div class="jp-chat"><small>${j.name}</small>${j.msgs.map(([k, t]) => `<p class="m ${k}">${t}</p>`).join('')}</div>`;
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (b) show(+b.dataset.i); });
  tabs.addEventListener('keydown', (e) => {
    const all = [...tabs.querySelectorAll('[role="tab"]')];
    const cur = all.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const nx = e.key === 'ArrowRight' ? (cur + 1) % all.length : e.key === 'ArrowLeft' ? (cur - 1 + all.length) % all.length : -1;
    if (nx >= 0) { show(nx); all[nx].focus(); e.preventDefault(); }
  });
  show(0);
}
