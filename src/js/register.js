// Register pattern: one record per external fact. Shared by the build, the page and the gates.
export const STATES = ['stated', 'absent', 'unconfirmed'];
const B58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const HEX = /0x[0-9a-fA-F]{40}/g;

export const isLive = (r) => !!r && r.state === 'stated' && typeof (r.value || r.url) === 'string' && (r.value || r.url).length > 0;

// Inert records expose label + state only: no value, no url.
export function project(rec) {
  if (!isLive(rec)) return { label: rec.label, state: rec.state === 'stated' ? 'unconfirmed' : rec.state };
  const o = { label: rec.label, state: 'stated' };
  for (const k of ['value', 'url', 'paths']) if (rec[k] !== undefined) o[k] = rec[k];
  return o;
}
export const projectAll = (reg) => Object.fromEntries(Object.entries(reg.records).map(([k, v]) => [k, project(v)]));

// Store the URL, derive the handle.
export function handleOf(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return seg ? '@' + seg : u.host;
  } catch { return ''; }
}

export const ICONS = {
  x: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  github: '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>'
};

// Markup for one social slot. Unstated: a span, no href, no value.
export function renderSocial(key, rec) {
  const icon = ICONS[key];
  const name = rec.label;
  if (isLive(rec) && rec.url) {
    return `<a class="icon-btn" data-slot="${key}" href="${rec.url}" target="_blank" rel="noopener noreferrer" aria-label="${name} ${handleOf(rec.url)}">${icon}</a>`;
  }
  return `<span class="icon-btn is-inert" data-slot="${key}" role="img" aria-disabled="true" aria-label="${name} pending">${icon}</span>`;
}

// Markup for the contract address slot.
export function renderCA(rec) {
  if (isLive(rec)) {
    return `<button class="ca-slot is-live" type="button" data-ca="${rec.value}" aria-label="Copy contract address"><span class="ca-label">${rec.label}</span><span class="ca-value">${rec.value}</span><span class="ca-act" data-copy-state="idle"><span class="ca-act-idle">Copy</span><span class="ca-act-done">Copied</span></span></button>`;
  }
  return `<div class="ca-slot is-inert" role="status"><span class="ca-label">${rec.label}</span><span class="ca-value ca-pending">pending</span></div>`;
}

// Gate warning: match address-shaped strings against the stated registry. 0x hex is never rejected by shape alone.
// The contract address record is exempt from the scanner, so a stated CA passes by registry match.
const shaped = (s) => s.startsWith('0x') || (/\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s));
export function scanAddresses(text, reg) {
  const known = new Set();
  for (const r of Object.values(reg.records)) if (isLive(r)) { known.add(r.value); if (r.url) known.add(r.url); }
  const found = [...(text.match(HEX) || []), ...(text.match(B58) || [])].filter(shaped);
  return found.filter((s) => !known.has(s));
}
