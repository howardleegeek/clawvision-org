# ClawVision.org (Static Site)

Pure static HTML + CSS + JS. No tracking.

## Local dev

1. Start relay API (port 8787):

```bash
cd ~/Downloads/claw-nation/relay
node src/server.js
```

2. Serve the site:

```bash
cd ~/Downloads/clawvision-org
python3 -m http.server 8000
```

3. Open:

- `http://127.0.0.1:8000/index.html`
- `http://127.0.0.1:8000/map.html`
- `http://127.0.0.1:8000/api.html`

## Data sources (dev)

- `GET http://127.0.0.1:8787/v1/world/stats`
- `GET http://127.0.0.1:8787/v1/world/cells`
- `GET http://127.0.0.1:8787/v1/world/events`
- `GET http://127.0.0.1:8787/v1/blobs/<evt_id>.jpg`

