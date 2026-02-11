/* API portal: endpoint docs + interactive playground */
(function () {
  const RELAY_STORAGE_KEY = 'clawvision_relay_base';
  const RELAY_DEFAULT = 'http://127.0.0.1:8787';

  const ENDPOINTS = [
    {
      id: 'world-stats',
      method: 'GET',
      path: '/v1/world/stats',
      title: 'World stats',
      desc: 'System overview: nodes, events, unique cells, and last event.',
      query: [
        { name: 'res', type: 'int', placeholder: '9', optional: true },
        { name: 'hours', type: 'number', placeholder: '24', optional: true },
      ],
      auth: 'none'
    },
    {
      id: 'world-cells',
      method: 'GET',
      path: '/v1/world/cells',
      title: 'Coverage heatmap',
      desc: 'Aggregate counts by H3 cell for a lookback window.',
      query: [
        { name: 'res', type: 'int', placeholder: '9', optional: true },
        { name: 'hours', type: 'number', placeholder: '24', optional: true },
        { name: 'limit', type: 'int', placeholder: '5000', optional: true },
      ],
      auth: 'none'
    },
    {
      id: 'world-events',
      method: 'GET',
      path: '/v1/world/events',
      title: 'Events by cell',
      desc: 'Query recent events in a specific H3 cell.',
      query: [
        { name: 'cell', type: 'string', placeholder: '8928308280fffff', optional: false },
        { name: 'limit', type: 'int', placeholder: '10', optional: true },
        { name: 'res', type: 'int', placeholder: '9', optional: true },
      ],
      auth: 'none'
    },
    {
      id: 'blob-jpg',
      method: 'GET',
      path: '/v1/blobs/{name}',
      title: 'Fetch JPEG blob',
      desc: 'Retrieve a stored JPEG frame blob (MVP local).',
      pathParams: [
        { name: 'name', type: 'string', placeholder: 'evt_abc123.jpg', optional: false }
      ],
      auth: 'none'
    },
    {
      id: 'nodes-register',
      method: 'POST',
      path: '/v1/nodes/register',
      title: 'Register node',
      desc: 'Register a camera node and receive a bearer token.',
      headers: [
        { name: 'x-register-secret', type: 'string', placeholder: '(optional)' }
      ],
      bodyExample: {
        name: 'clawphone-dev',
        capabilities: ['vision', 'gps', 'mic']
      },
      auth: 'register-secret'
    },
    {
      id: 'events-frame',
      method: 'POST',
      path: '/v1/events/frame',
      title: 'Submit frame',
      desc: 'Ingest a frame event (requires bearer token).',
      headers: [
        { name: 'authorization', type: 'string', placeholder: 'Bearer tok_...' }
      ],
      bodyExample: {
        ts: new Date().toISOString(),
        lat: 37.7749,
        lon: -122.4194,
        heading: 0,
        h3_res: 9,
        transcript: 'sidewalk traffic',
        jpeg_base64: '(fill via file picker)'
      },
      auth: 'bearer'
    }
  ];

  const q = new URLSearchParams(location.search);

  const els = {
    endpoints: document.getElementById('endpoints'),

    pgMethod: document.getElementById('pgMethod'),
    pgPath: document.getElementById('pgPath'),
    pgSend: document.getElementById('pgSend'),
    pgEndpoint: document.getElementById('pgEndpoint'),
    pgBaseUrl: document.getElementById('pgBaseUrl'),
    pgParams: document.getElementById('pgParams'),

    pgAuth: document.getElementById('pgAuth'),
    pgBearer: document.getElementById('pgBearer'),
    pgRegisterSecret: document.getElementById('pgRegisterSecret'),
    pgXSecret: document.getElementById('pgXSecret'),

    pgBodyWrap: document.getElementById('pgBodyWrap'),
    pgBody: document.getElementById('pgBody'),
    pgLoadExample: document.getElementById('pgLoadExample'),
    pgJpegFile: document.getElementById('pgJpegFile'),

    pgCode: document.getElementById('pgCode'),
    pgStatus: document.getElementById('pgStatus'),
    pgResp: document.getElementById('pgResp'),
    pgRespWrap: document.getElementById('pgRespWrap'),
    pgCopyResp: document.getElementById('pgCopyResp'),
  };

  function baseUrl() {
    const v = (els.pgBaseUrl.value || '').trim();
    return (v || RELAY_DEFAULT).replace(/\/+$/, '');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildEndpointsCards() {
    const root = els.endpoints;
    if (!root) return;
    root.innerHTML = '';

    for (const ep of ENDPOINTS) {
      const methodClass = ep.method.toLowerCase();
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="endpoint">
          <div>
            <span class="method ${methodClass}">${ep.method}</span>
            <code>${escapeHtml(ep.path)}</code>
          </div>
          <a class="btn small" href="#playground" data-ep="${escapeHtml(ep.id)}">Try</a>
        </div>
        <h3 style="margin-top:12px;">${escapeHtml(ep.title)}</h3>
        <p>${escapeHtml(ep.desc)}</p>
      `;
      root.appendChild(card);
    }

    root.addEventListener('click', (e) => {
      const a = e.target && e.target.closest('a[data-ep]');
      if (!a) return;
      const id = a.getAttribute('data-ep');
      if (!id) return;
      setSelectedEndpoint(id);
    });
  }

  function fillEndpointSelect() {
    els.pgEndpoint.innerHTML = '';
    for (const ep of ENDPOINTS) {
      const opt = document.createElement('option');
      opt.value = ep.id;
      opt.textContent = `${ep.method} ${ep.path}`;
      els.pgEndpoint.appendChild(opt);
    }
  }

  function setMethodBadge(method) {
    els.pgMethod.textContent = method;
    els.pgMethod.classList.remove('get', 'post');
    els.pgMethod.classList.add(method.toLowerCase());
  }

  function buildParamInput(name, placeholder) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <label>${escapeHtml(name)}</label>
      <input data-param="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder || '')}" />
    `;
    return wrap;
  }

  function currentEndpoint() {
    const id = els.pgEndpoint.value;
    return ENDPOINTS.find((e) => e.id === id) || ENDPOINTS[0];
  }

  function setSelectedEndpoint(id) {
    const ep = ENDPOINTS.find((e) => e.id === id);
    if (!ep) return;
    els.pgEndpoint.value = id;
    renderPlayground();
  }

  function renderPlayground() {
    const ep = currentEndpoint();
    setMethodBadge(ep.method);
    els.pgPath.textContent = ep.path;

    els.pgParams.innerHTML = '';

    const pathParams = ep.pathParams || [];
    const query = ep.query || [];

    for (const p of pathParams) els.pgParams.appendChild(buildParamInput(p.name, p.placeholder));
    for (const p of query) els.pgParams.appendChild(buildParamInput(p.name, p.placeholder));

    const needsBody = ep.method === 'POST';
    els.pgBodyWrap.style.display = needsBody ? 'block' : 'none';

    const showBearer = ep.auth === 'bearer';
    els.pgAuth.style.display = showBearer ? 'block' : 'none';
    const showSecret = ep.auth === 'register-secret';
    els.pgRegisterSecret.style.display = showSecret ? 'block' : 'none';

    // Defaults from query string (deep links).
    if (ep.id === 'world-events' && q.get('cell')) {
      const cellInput = els.pgParams.querySelector('input[data-param="cell"]');
      if (cellInput) cellInput.value = q.get('cell');
    }
    if ((ep.id === 'world-cells' || ep.id === 'world-stats') && q.get('hours')) {
      const hoursInput = els.pgParams.querySelector('input[data-param="hours"]');
      if (hoursInput) hoursInput.value = q.get('hours');
    }
    if (q.get('res')) {
      const resInput = els.pgParams.querySelector('input[data-param="res"]');
      if (resInput && !resInput.value) resInput.value = q.get('res');
    }

    updateCodeSnippet();
  }

  function buildUrl(ep) {
    let path = ep.path;
    const urlBase = baseUrl();
    const qp = new URLSearchParams();

    const inputs = Array.from(els.pgParams.querySelectorAll('input[data-param]'));
    const values = {};
    for (const i of inputs) values[i.getAttribute('data-param')] = (i.value || '').trim();

    // Path params
    if (ep.pathParams) {
      for (const p of ep.pathParams) {
        const v = values[p.name] || '';
        path = path.replace(`{${p.name}}`, encodeURIComponent(v));
      }
    }

    // Query params
    if (ep.query) {
      for (const p of ep.query) {
        const v = values[p.name];
        if (!v) continue;
        qp.set(p.name, v);
      }
    }

    const qs = qp.toString();
    return `${urlBase}${path}${qs ? `?${qs}` : ''}`;
  }

  function updateCodeSnippet() {
    const ep = currentEndpoint();
    const url = buildUrl(ep);

    const lines = [];
    lines.push(`# cURL`);
    if (ep.method === 'GET') {
      lines.push(`curl "${url}"`);
    } else if (ep.id === 'nodes-register') {
      const body = els.pgBody.value?.trim() || JSON.stringify(ep.bodyExample, null, 2);
      const secret = (els.pgXSecret.value || '').trim();
      const h = secret ? ` -H "x-register-secret: ${secret}"` : '';
      lines.push(`curl -X POST "${url}"${h} -H "content-type: application/json" -d '${body.replace(/'/g, "'\\''")}'`);
    } else if (ep.id === 'events-frame') {
      const body = els.pgBody.value?.trim() || JSON.stringify(ep.bodyExample, null, 2);
      const bearer = (els.pgBearer.value || '').trim();
      const auth = bearer ? ` -H "authorization: Bearer ${bearer}"` : ` -H "authorization: Bearer <token>"`;
      lines.push(`curl -X POST "${url}"${auth} -H "content-type: application/json" -d '${body.replace(/'/g, "'\\''")}'`);
    } else {
      lines.push(`curl -X POST "${url}" -H "content-type: application/json" -d '{}'`);
    }

    lines.push('');
    lines.push(`# Python`);
    lines.push('import requests');
    if (ep.method === 'GET') {
      lines.push(`r = requests.get("${url}")`);
    } else {
      lines.push(`r = requests.request("${ep.method}", "${url}", json=${JSON.stringify(ep.bodyExample || {}, null, 2)})`);
    }
    lines.push('print(r.status_code)');
    lines.push('print(r.text)');

    lines.push('');
    lines.push(`# JavaScript`);
    if (ep.method === 'GET') {
      lines.push(`const r = await fetch("${url}");`);
      lines.push('console.log(await r.json());');
    } else {
      lines.push(`const r = await fetch("${url}", { method: "${ep.method}", headers: { "content-type": "application/json" }, body: JSON.stringify(${JSON.stringify(ep.bodyExample || {}, null, 2)}) });`);
      lines.push('console.log(await r.json());');
    }

    els.pgCode.textContent = lines.join('\n');
  }

  async function fetchWithTimeout(url, opts, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...opts, signal: ctrl.signal });
      const ct = resp.headers.get('content-type') || '';
      if (ct.startsWith('image/')) {
        const blob = await resp.blob();
        return { resp, type: 'image', blob };
      }
      const text = await resp.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { resp, type: 'json', text, json };
    } finally {
      clearTimeout(t);
    }
  }

  async function runRequest() {
    const ep = currentEndpoint();
    const url = buildUrl(ep);

    const headers = {};
    if (ep.method === 'POST') headers['content-type'] = 'application/json';
    if (ep.id === 'events-frame') {
      const bearer = (els.pgBearer.value || '').trim();
      if (bearer) headers['authorization'] = `Bearer ${bearer}`;
    }
    if (ep.id === 'nodes-register') {
      const secret = (els.pgXSecret.value || '').trim();
      if (secret) headers['x-register-secret'] = secret;
    }

    let body = undefined;
    if (ep.method === 'POST') {
      const raw = (els.pgBody.value || '').trim();
      if (raw) {
        body = raw;
      } else {
        body = JSON.stringify(ep.bodyExample || {}, null, 2);
        els.pgBody.value = body;
      }
    }

    els.pgStatus.textContent = `Requesting ${ep.method} ${ep.path}...`;
    els.pgCopyResp.disabled = true;

    let out;
    const t0 = performance.now();
    try {
      out = await fetchWithTimeout(url, { method: ep.method, headers, body }, 8000);
    } catch (e) {
      els.pgStatus.textContent = `ERROR: ${e?.message || e}`;
      els.pgResp.textContent = '{}';
      els.pgCopyResp.disabled = false;
      return;
    }
    const ms = Math.round(performance.now() - t0);

    els.pgStatus.textContent = `HTTP ${out.resp.status} • ${ms}ms`;
    els.pgCopyResp.disabled = false;

    if (out.type === 'image') {
      const urlObj = URL.createObjectURL(out.blob);
      els.pgRespWrap.innerHTML = `<img src="${urlObj}" alt="Response image" />`;
      return;
    }

    const toShow = out.json != null ? JSON.stringify(out.json, null, 2) : out.text;
    els.pgRespWrap.innerHTML = `<pre id="pgResp">${escapeHtml(toShow)}</pre>`;
  }

  function setupCopy() {
    const btns = Array.from(document.querySelectorAll('.copy-btn[data-copy]'));
    for (const btn of btns) {
      btn.addEventListener('click', async () => {
        const sel = btn.getAttribute('data-copy');
        const target = sel ? document.querySelector(sel) : null;
        if (!target) return;
        try {
          await navigator.clipboard.writeText(target.textContent || '');
          const prev = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(() => (btn.textContent = prev), 900);
        } catch {
          // ignore
        }
      });
    }

    els.pgCopyResp.addEventListener('click', async () => {
      const txt = document.querySelector('#pgResp')?.textContent || '';
      try {
        await navigator.clipboard.writeText(txt);
        const prev = els.pgCopyResp.textContent;
        els.pgCopyResp.textContent = 'Copied';
        setTimeout(() => (els.pgCopyResp.textContent = prev), 900);
      } catch {
        // ignore
      }
    });
  }

  function setupPlaygroundBindings() {
    els.pgEndpoint.addEventListener('change', () => {
      renderPlayground();
    });
    els.pgBaseUrl.addEventListener('change', () => {
      localStorage.setItem(RELAY_STORAGE_KEY, (els.pgBaseUrl.value || '').trim());
      updateCodeSnippet();
    });
    els.pgParams.addEventListener('input', updateCodeSnippet);
    els.pgBearer.addEventListener('input', updateCodeSnippet);
    els.pgXSecret.addEventListener('input', updateCodeSnippet);
    els.pgBody.addEventListener('input', updateCodeSnippet);

    els.pgSend.addEventListener('click', runRequest);
    els.pgLoadExample.addEventListener('click', () => {
      const ep = currentEndpoint();
      if (ep.bodyExample) els.pgBody.value = JSON.stringify(ep.bodyExample, null, 2);
      updateCodeSnippet();
    });

    els.pgJpegFile.addEventListener('change', async () => {
      const ep = currentEndpoint();
      if (ep.id !== 'events-frame') return;
      const f = els.pgJpegFile.files && els.pgJpegFile.files[0];
      if (!f) return;
      const buf = await f.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      let obj;
      try {
        obj = JSON.parse(els.pgBody.value || '{}');
      } catch {
        obj = {};
      }
      obj.jpeg_base64 = b64;
      els.pgBody.value = JSON.stringify(obj, null, 2);
      updateCodeSnippet();
    });
  }

  function setupReveal() {
    const nodes = Array.from(document.querySelectorAll('.reveal'));
    if (!('IntersectionObserver' in window)) {
      for (const n of nodes) n.classList.add('is-visible');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) e.target.classList.add('is-visible');
      },
      { threshold: 0.14 }
    );
    for (const n of nodes) io.observe(n);
  }

  function init() {
    buildEndpointsCards();
    fillEndpointSelect();

    const saved = localStorage.getItem(RELAY_STORAGE_KEY);
    els.pgBaseUrl.value = q.get('base') || saved || RELAY_DEFAULT;

    const endpointFromQuery = q.get('endpoint');
    if (endpointFromQuery) {
      const found = ENDPOINTS.find((e) => e.id === endpointFromQuery);
      if (found) els.pgEndpoint.value = found.id;
    }

    renderPlayground();
    setupCopy();
    setupPlaygroundBindings();
    setupReveal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

