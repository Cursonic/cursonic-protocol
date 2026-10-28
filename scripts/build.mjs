import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './render.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (...p) => join(root, 'src', ...p);
const dist = (...p) => join(root, 'dist', ...p);

rmSync(dist(), { recursive: true, force: true });
mkdirSync(dist('assets'), { recursive: true });
mkdirSync(dist('js'), { recursive: true });

const tokens = readFileSync(src('tokens.css'), 'utf8');
const register = JSON.parse(readFileSync(join(root, 'register.json'), 'utf8'));

writeFileSync(dist('styles.css'), tokens + '\n' + readFileSync(src('styles.css'), 'utf8'));
writeFileSync(dist('index.html'), renderPage(readFileSync(src('index.html'), 'utf8'), register, tokens));

for (const f of readdirSync(src('js'))) copyFileSync(src('js', f), dist('js', f));

// Logo and favicon are copied explicitly so a missing file fails the build.
for (const f of ['assets/logo-512.png', 'assets/logo-192.png', 'assets/logo-64.png']) {
  if (!existsSync(src(f))) throw new Error('missing asset ' + f);
  copyFileSync(src(f), dist(f));
}
if (!existsSync(src('assets/favicon.svg'))) throw new Error('missing favicon');
copyFileSync(src('assets/favicon.svg'), dist('favicon.svg'));

writeFileSync(dist('_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n');
console.log('built dist/');
