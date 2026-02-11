/* Live map: Leaflet + h3-js, backed by relay API on localhost:8787 */
(function () {
  const RELAY_STORAGE_KEY = 'clawvision_relay_base';
  const RELAY_DEFAULT = 'http://127.0.0.1:8787';

  const q = new URLSearchParams(location.search);
  const EMBED = q.get('embed') === '1';
  const MINI = q.get('mini') === '1';

  if (EMBED) document.body.classList.add('embed');

  const els = {
    relayUrl: document.getElementById('relayUrl'),
    h3Res: document.getElementById('h3Res'),
    hours: document.getElementById('hours'),
    scale: document.getElementById('scale'),
    minCount: document.getElementById('minCount'),
    autoEvery: document.getElementById('autoEvery'),
    fitMode: document.getElementById('fitMode'),
    btnLoad: document.getElementById('btnLoad'),
    btnFit: document.getElementById('btnFit'),
    btnClear: document.getElementById('btnClear'),
    asOf: document.getElementById('asOf'),
    panel: document.getElementById('mapPanel'),

    pActiveNodes: document.getElementById('pActiveNodes'),
    pActiveNodesSub: document.getElementById('pActiveNodesSub'),
    pEvents: document.getElementById('pEvents'),
    pEventsSub: document.getElementById('pEventsSub'),
    pCells: document.getElementById('pCells'),
    pCellsSub: document.getElementById('pCellsSub'),
    pFresh: document.getElementById('pFresh'),
    pFreshSub: document.getElementById('pFreshSub'),

    drawer: document.getElementById('detailDrawer'),
    drawerClose: document.getElementById('drawerClose'),
    cellTitle: document.getElementById('cellTitle'),
    cellMeta: document.getElementById('cellMeta'),
    thumbWrap: document.getElementById('thumbWrap'),
    cellThumb: document.getElementById('cellThumb'),
    cellQueryLink: document.getElementById('cellQueryLink'),
    cellEventsLink: document.getElementById('cellEventsLink'),
  };

  function baseUrl() {
    const v = (els.relayUrl?.value || '').trim();
    return (v || RELAY_DEFAULT).replace(/\/+$/, '');
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function normalize(val, min, max, mode) {
    if (!Number.isFinite(val)) return 0;
    if (max <= min) return 1;
    if (mode === 'log') {
      const v = Math.log10(1 + Math.max(0, val - min));
      const m = Math.log10(1 + Math.max(1e-9, max - min));
      return clamp01(m ? (v / m) : 1);
    }
    return clamp01((val - min) / (max - min));
  }

  function rampColor(t) {
    // Teal -> Green -> Yellow (high)
    const tt = clamp01(t);
    const hue = 190 - tt * 120; // 190..70
    const sat = 90;
    const light = 54 - tt * 6;
    return `hsl(${hue} ${sat}% ${light}%)`;
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
      return { ok: resp.ok && data && (data.ok === true || data.ok === undefined), resp, data };
    } catch (e) {
      return { ok: false, error: e };
    } finally {
      clearTimeout(t);
    }
  }

  function applyQueryDefaults() {
    const res = q.get('res');
    const hours = q.get('hours');
    const minCount = q.get('minCount');
    const scale = q.get('scale');
    const autoEvery = q.get('autoEvery');

    if (els.h3Res && res) els.h3Res.value = res;
    if (els.hours && hours) els.hours.value = hours;
    if (els.minCount && minCount) els.minCount.value = minCount;
    if (els.scale && scale) els.scale.value = scale;
    if (els.autoEvery && autoEvery) els.autoEvery.value = autoEvery;
  }

  function initRelayInput() {
    if (!els.relayUrl) return;
    const saved = localStorage.getItem(RELAY_STORAGE_KEY);
    els.relayUrl.value = saved || RELAY_DEFAULT;
    const fromQuery = q.get('relay');
    if (fromQuery) els.relayUrl.value = fromQuery;
    els.relayUrl.addEventListener('change', () => {
      localStorage.setItem(RELAY_STORAGE_KEY, (els.relayUrl.value || '').trim());
    });
  }

  const map = L.map('map', {
    zoomControl: !MINI,
    preferCanvas: true,
    worldCopyJump: true,
    scrollWheelZoom: !EMBED,
    dragging: !EMBED,
    doubleClickZoom: !EMBED,
    boxZoom: !EMBED,
    keyboard: !EMBED,
    tap: !EMBED,
  }).setView([20, 0], MINI ? 1.6 : 2);

  const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  });
  tiles.addTo(map);

  const canvasRenderer = L.canvas({ padding: 0.28 });
  const hexLayer = L.layerGroup().addTo(map);

  let lastBounds = null;
  let autoTimer = null;
  let loadedOnce = false;
  let lastCellCache = new Map(); // cell -> {count}

  function fitToBounds() {
    if (!lastBounds) return;
    map.fitBounds(lastBounds, { padding: [40, 40], maxZoom: 14 });
  }

  function clearMap() {
    hexLayer.clearLayers();
    lastBounds = null;
    lastCellCache = new Map();
  }

  function openDrawer() {
    if (!els.drawer) return;
    els.drawer.classList.add('open');
  }

  function closeDrawer() {
    if (!els.drawer) return;
    els.drawer.classList.remove('open');
  }

  async function loadStats() {
    if (EMBED) return;
    const res = Number(els.h3Res?.value || '9');
    const hours = Number(els.hours?.value || '24');
    const qs = new URLSearchParams({ res: String(res), hours: String(hours) });
    const url = `${baseUrl()}/v1/world/stats?${qs.toString()}`;
    const r = await fetchJson(url, 2200);
    if (!r.ok || !r.data?.ok) {
      els.pActiveNodes.textContent = '30,000+';
      els.pActiveNodesSub.textContent = 'fallback';
      els.pEvents.textContent = '-';
      els.pCells.textContent = '-';
      els.pFresh.textContent = '-';
      return;
    }

    const d = r.data;
    els.pActiveNodes.textContent = formatInt(d.active_nodes);
    els.pActiveNodesSub.textContent = `total nodes: ${formatInt(d.nodes_total)}`;
    els.pEvents.textContent = formatInt(d.events_total);
    els.pEventsSub.textContent = `last ${hours}h`;
    els.pCells.textContent = formatInt(d.unique_cells);
    els.pCellsSub.textContent = `H3 res ${d.res ?? res}`;
    const lastTs = Date.parse(d?.last_event?.ts || '');
    if (Number.isFinite(lastTs)) {
      els.pFresh.textContent = `${msToAge(Date.now() - lastTs)} ago`;
      els.pFreshSub.textContent = d?.last_event?.id ? `last: ${d.last_event.id}` : 'last event';
    } else {
      els.pFresh.textContent = '-';
      els.pFreshSub.textContent = 'no events';
    }
  }

  async function loadCells() {
    const started = performance.now();
    const url = baseUrl();
    const res = Number(els.h3Res?.value || '9');
    const hours = Number(els.hours?.value || '24');
    const minCount = Math.max(1, Number(els.minCount?.value || '1'));
    const scale = String(els.scale?.value || 'log');

    const qs = new URLSearchParams({ res: String(res), limit: MINI ? '8000' : '5000', hours: String(hours) });
    const r = await fetchJson(`${url}/v1/world/cells?${qs.toString()}`, 5000);

    if (!r.ok || !r.data?.ok) {
      if (!EMBED && els.asOf) els.asOf.textContent = 'as-of: error';
      return;
    }

    const cellsRaw = Array.isArray(r.data.cells) ? r.data.cells : [];
    const cells = cellsRaw
      .map((c) => ({ cell: String(c.cell || ''), count: Number(c.count || 0) }))
      .filter((c) => c.cell && Number.isFinite(c.count) && c.count >= minCount);

    let min = Infinity;
    let max = 0;
    for (const c of cells) {
      if (c.count < min) min = c.count;
      if (c.count > max) max = c.count;
    }
    if (!Number.isFinite(min)) min = 0;

    // Render progressively (micro "reveal" even with canvas renderer).
    hexLayer.clearLayers();
    lastCellCache = new Map();

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    const batch = 220;
    let idx = 0;

    function addBatch() {
      const end = Math.min(cells.length, idx + batch);
      for (; idx < end; idx++) {
        const c = cells[idx];
        lastCellCache.set(c.cell, { count: c.count });
        let boundary;
        try {
          boundary = h3.cellToBoundary(c.cell, false);
        } catch {
          continue;
        }

        const latlngs = boundary.map(([lat, lng]) => [lat, lng]);
        for (const [lat, lng] of latlngs) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }

        const t = normalize(c.count, min, max, scale);
        const fill = rampColor(t);
        const poly = L.polygon(latlngs, {
          renderer: canvasRenderer,
          weight: 0.7,
          color: 'rgba(0,0,0,0.35)',
          fillColor: fill,
          fillOpacity: EMBED ? 0.46 : 0.64,
        });

        if (!EMBED) {
          poly.on('click', () => onCellClick(c.cell, c.count));
        }

        hexLayer.addLayer(poly);
      }

      if (idx < cells.length) {
        requestAnimationFrame(addBatch);
        return;
      }

      lastBounds = (cells.length > 0 && minLat <= maxLat && minLng <= maxLng)
        ? L.latLngBounds([[minLat, minLng], [maxLat, maxLng]])
        : null;

      const mode = String(els.fitMode?.value || 'first');
      const shouldFit = mode === 'always' || (mode === 'first' && !loadedOnce);
      loadedOnce = true;
      if (shouldFit && lastBounds && !EMBED) fitToBounds();

      if (!EMBED && els.asOf) {
        const ms = Math.round(performance.now() - started);
        els.asOf.textContent = `as-of: ${new Date().toISOString().slice(0, 19)}Z • ${ms}ms`;
      }
    }

    addBatch();
  }

  async function onCellClick(cell, count) {
    const url = baseUrl();
    const res = Number(els.h3Res?.value || '9');
    const hours = Number(els.hours?.value || '24');

    openDrawer();
    els.cellTitle.textContent = `H3 ${cell}`;
    els.cellMeta.textContent = `count: ${formatInt(count)}\nloading events...`;
    els.thumbWrap.style.display = 'none';
    els.cellThumb.removeAttribute('src');

    const eventsUrl = `${url}/v1/world/events?cell=${encodeURIComponent(cell)}&limit=10&res=${encodeURIComponent(String(res))}`;
    els.cellEventsLink.href = eventsUrl;

    const apiLink = new URL('api.html', location.href);
    apiLink.searchParams.set('endpoint', 'world-events');
    apiLink.searchParams.set('cell', cell);
    apiLink.searchParams.set('res', String(res));
    apiLink.searchParams.set('hours', String(hours));
    els.cellQueryLink.href = apiLink.toString().replace(location.origin + '/', '');

    const r = await fetchJson(eventsUrl, 4000);
    if (!r.ok || !r.data?.ok) {
      els.cellMeta.textContent = `count: ${formatInt(count)}\nERROR: failed to fetch events`;
      return;
    }

    const events = Array.isArray(r.data.events) ? r.data.events : [];
    const latest = events[0] || null;
    const latestTs = latest?.ts ? String(latest.ts) : null;
    const lastAge = latestTs ? msToAge(Date.now() - Date.parse(latestTs)) : '-';
    const line1 = `count: ${formatInt(count)} (events returned: ${events.length})`;
    const line2 = `latest: ${latestTs ? `${latestTs} (${lastAge} ago)` : '-'}`;
    const line3 = latest?.id ? `latest id: ${latest.id}` : '';
    els.cellMeta.textContent = [line1, line2, line3].filter(Boolean).join('\n');

    const preview = latest?.preview_url ? String(latest.preview_url) : null;
    if (preview) {
      els.thumbWrap.style.display = 'block';
      els.cellThumb.src = `${url}${preview.startsWith('/') ? '' : '/'}${preview}`;
    }
  }

  function setAutoRefresh() {
    const every = Number(els.autoEvery?.value || '0');
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (every > 0) {
      autoTimer = setInterval(() => {
        loadCells();
        loadStats();
      }, every * 1000);
    }
  }

  function bindControls() {
    if (EMBED) return;
    els.btnLoad?.addEventListener('click', () => {
      loadCells();
      loadStats();
    });
    els.btnFit?.addEventListener('click', fitToBounds);
    els.btnClear?.addEventListener('click', () => {
      clearMap();
      closeDrawer();
    });
    els.autoEvery?.addEventListener('change', setAutoRefresh);
    els.drawerClose?.addEventListener('click', closeDrawer);
  }

  function init() {
    initRelayInput();
    applyQueryDefaults();
    bindControls();
    setAutoRefresh();
    loadCells();
    loadStats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

