/* Landing page logic: live stats + reveal + counters + copy buttons */
(function () {
  const RELAY_DEFAULT = 'http://127.0.0.1:8787';

  function qs(sel) {
    return document.querySelector(sel);
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
  }

  function formatInt(n) {
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString('en-US');
  }

  function msToAge(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '-';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      const data = await resp.json().catch(() => null);
      return { ok: resp.ok && data && data.ok, resp, data };
    } catch (e) {
      return { ok: false, error: e };
    } finally {
      clearTimeout(t);
    }
  }

  async function loadStats() {
    const url = `${RELAY_DEFAULT}/v1/world/stats?res=9&hours=24`;
    const r = await fetchJson(url, 1600);
    if (!r.ok) {
      // Spec requirement: fallback shows "30,000+"
      setText('statActiveNodes', '30,000+');
      setText('statActiveNodesSub', 'fallback');
      setText('statEvents', '-');
      setText('statCells', '-');
      setText('statFresh', '-');
      return;
    }

    const d = r.data || {};
    setText('statActiveNodes', formatInt(d.active_nodes));
    setText('statActiveNodesSub', `total nodes: ${formatInt(d.nodes_total)}`);
    setText('statEvents', formatInt(d.events_total));
    setText('statEventsSub', 'last 24h');
    setText('statCells', formatInt(d.unique_cells));
    setText('statCellsSub', `H3 res ${d.res ?? 9}`);

    const lastTs = Date.parse(d?.last_event?.ts || '');
    if (Number.isFinite(lastTs)) {
      setText('statFresh', `${msToAge(Date.now() - lastTs)} ago`);
      setText('statFreshSub', d?.last_event?.id ? `last: ${d.last_event.id}` : 'last event');
    } else {
      setText('statFresh', '-');
      setText('statFreshSub', 'no events');
    }
  }

  function setupReveal() {
    const els = Array.from(document.querySelectorAll('.reveal'));
    if (!('IntersectionObserver' in window)) {
      for (const el of els) el.classList.add('is-visible');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) e.target.classList.add('is-visible');
        }
      },
      { root: null, threshold: 0.14 }
    );
    for (const el of els) io.observe(el);
  }

  function setupCounters() {
    const nums = Array.from(document.querySelectorAll('[data-count]'));
    if (!('IntersectionObserver' in window)) return;

    const run = (el) => {
      const target = Number(el.getAttribute('data-count') || '0');
      const prefix = el.getAttribute('data-prefix') || '';
      const suffix = el.getAttribute('data-suffix') || '';
      const dur = 900;
      const start = performance.now();

      function step(t) {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = Math.round(target * eased);
        el.textContent = `${prefix}${v.toLocaleString('en-US')}${suffix}`;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    };

    const seen = new WeakSet();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (seen.has(e.target)) continue;
          seen.add(e.target);
          run(e.target);
        }
      },
      { threshold: 0.18 }
    );

    for (const el of nums) io.observe(el);
  }

  function setupCopyButtons() {
    const btns = Array.from(document.querySelectorAll('.copy-btn[data-copy]'));
    for (const btn of btns) {
      btn.addEventListener('click', async () => {
        const sel = btn.getAttribute('data-copy');
        if (!sel) return;
        const target = document.querySelector(sel);
        if (!target) return;
        const txt = target.textContent || '';
        try {
          await navigator.clipboard.writeText(txt);
          const prev = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(() => (btn.textContent = prev), 900);
        } catch {
          // ignore
        }
      });
    }
  }

  async function init() {
    setupReveal();
    setupCounters();
    setupCopyButtons();
    await loadStats();
    setInterval(loadStats, 10_000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

