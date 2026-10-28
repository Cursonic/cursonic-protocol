// Motion layer: damped spring solver, reveal stagger, parallax, spotlight, scroll progress.
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Semi-implicit Euler on a damped harmonic oscillator, fixed 1/240 s sub-steps.
export function spring(from, to, onUpdate, { k = 170, c = 15, m = 1, eps = 0.001 } = {}) {
  if (reduced) { onUpdate(to); return () => {}; }
  let x = from, v = 0, last = performance.now(), raf = 0, dead = false;
  const dt = 1 / 240;
  const tick = (now) => {
    if (dead) return;
    let acc = Math.min(0.05, (now - last) / 1000); last = now;
    while (acc > 0) {
      const step = Math.min(dt, acc);
      v += ((-k * (x - to) - c * v) / m) * step;
      x += v * step;
      acc -= step;
    }
    if (Math.abs(x - to) < eps && Math.abs(v) < eps) { onUpdate(to); return; }
    onUpdate(x);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

export function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (reduced || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('shown')); return; }
  const queue = [];
  let timer = 0;
  const run = (el, delay) => setTimeout(() => {
    spring(0, 1, (p) => {
      el.style.opacity = String(Math.max(0, Math.min(1, p * 1.2)));
      el.style.transform = `translateY(${(1 - p) * 28}px) scale(${0.98 + 0.02 * p})`;
    }, { k: 150, c: 14 });
    setTimeout(() => { el.classList.add('shown'); el.style.opacity = ''; el.style.transform = ''; }, 900);
  }, delay);
  const flush = () => { timer = 0; queue.splice(0).forEach((el, i) => run(el, i * 70)); };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); queue.push(e.target); }
    if (queue.length && !timer) timer = setTimeout(flush, 16);
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((e) => io.observe(e));
}

export function initSpotlight() {
  document.addEventListener('pointermove', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-spot]');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${ev.clientX - r.left}px`);
    t.style.setProperty('--my', `${ev.clientY - r.top}px`);
  }, { passive: true });
}

export function initProgress() {
  const bar = document.querySelector('.progress i');
  if (!bar) return;
  let queued = false;
  const upd = () => {
    queued = false;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  const on = () => { if (!queued) { queued = true; requestAnimationFrame(upd); } };
  addEventListener('scroll', on, { passive: true });
  addEventListener('resize', on);
  upd();
}

export function initParallax() {
  const layers = [...document.querySelectorAll('.layer[data-depth]')];
  if (reduced || !layers.length) return;
  const st = { px: 0, py: 0, tx: 0, ty: 0, sy: 0 };
  addEventListener('pointermove', (e) => { st.tx = e.clientX / innerWidth - 0.5; st.ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  let raf = 0;
  const frame = () => {
    st.px += (st.tx - st.px) * 0.08;
    st.py += (st.ty - st.py) * 0.08;
    const sy = Math.min(scrollY, 900);
    for (const l of layers) {
      const d = parseFloat(l.dataset.depth);
      l.style.transform = `translate3d(${st.px * 26 * d}px,${st.py * 20 * d - sy * 0.07 * d}px,0) rotateY(${st.px * 6 * d}deg) rotateX(${-st.py * 5 * d}deg)`;
    }
    raf = requestAnimationFrame(frame);
  };
  const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame); };
  document.addEventListener('visibilitychange', vis);
  vis();
}

// Count-up with easeOutExpo; returns cancel.
export function countTo(from, to, fmt, onText, dur = 700) {
  if (reduced || from === to) { onText(fmt(to)); return () => {}; }
  const t0 = performance.now();
  let raf = 0, dead = false;
  const tick = (now) => {
    if (dead) return;
    const p = Math.min(1, (now - t0) / dur);
    const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    onText(fmt(from + (to - from) * e));
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { dead = true; cancelAnimationFrame(raf); };
}
