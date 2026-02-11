#!/usr/bin/env node
'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const RELAY_BASE_URL = process.env.RELAY_BASE_URL || 'http://127.0.0.1:8787';
const REGISTER_SECRET = process.env.REGISTER_SECRET || '';
const MIN_EVENTS_PER_NODE = 5;
const MAX_EVENTS_PER_NODE = 20;
const MAX_COORD_OFFSET = 0.01;

// 1x1 valid JPEG base64.
const DEMO_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFhUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGhAQGy0mICYtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQMC/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEB/9oADAMBAAIQAxAAAAH1D//EABYQAQEBAAAAAAAAAAAAAAAAAAEQEf/aAAgBAQABBQKrf//EABYRAQEBAAAAAAAAAAAAAAAAAAEQEf/aAAgBAwEBPwGn/8QAFhEBAQEAAAAAAAAAAAAAAAAAARAR/9oACAECAQE/AYf/xAAXEAADAQAAAAAAAAAAAAAAAAAAARAx/9oACAEBAAY/Apf/xAAYEAADAQEAAAAAAAAAAAAAAAAAAREQIf/aAAgBAQABPyG7p//aAAwDAQACAAMAAAAQ8//EABYRAQEBAAAAAAAAAAAAAAAAAAABEf/aAAgBAwEBPxBz/8QAFhEBAQEAAAAAAAAAAAAAAAAAARAR/9oACAECAQE/EGP/xAAYEAEAAwEAAAAAAAAAAAAAAAABABEhMf/aAAgBAQABPxA7R6q7/9k=';

const CITIES = [
  { city: 'New York', slug: 'new-york', lat: 40.7128, lon: -74.006, nodes: 2 },
  { city: 'San Francisco', slug: 'san-francisco', lat: 37.7749, lon: -122.4194, nodes: 2 },
  { city: 'Los Angeles', slug: 'los-angeles', lat: 34.0522, lon: -118.2437, nodes: 2 },
  { city: 'London', slug: 'london', lat: 51.5074, lon: -0.1278, nodes: 2 },
  { city: 'Tokyo', slug: 'tokyo', lat: 35.6762, lon: 139.6503, nodes: 3 },
  { city: 'Shanghai', slug: 'shanghai', lat: 31.2304, lon: 121.4737, nodes: 2 },
  { city: 'Singapore', slug: 'singapore', lat: 1.3521, lon: 103.8198, nodes: 2 },
  { city: 'Dubai', slug: 'dubai', lat: 25.2048, lon: 55.2708, nodes: 2 },
  { city: 'Sydney', slug: 'sydney', lat: -33.8688, lon: 151.2093, nodes: 2 },
  { city: 'Berlin', slug: 'berlin', lat: 52.52, lon: 13.405, nodes: 2 },
  { city: 'Paris', slug: 'paris', lat: 48.8566, lon: 2.3522, nodes: 2 },
  { city: 'Toronto', slug: 'toronto', lat: 43.6532, lon: -79.3832, nodes: 2 },
  { city: 'Seoul', slug: 'seoul', lat: 37.5665, lon: 126.978, nodes: 2 },
  { city: 'Hong Kong', slug: 'hong-kong', lat: 22.3193, lon: 114.1694, nodes: 2 },
  { city: 'Mumbai', slug: 'mumbai', lat: 19.076, lon: 72.8777, nodes: 2 },
  { city: 'Shenzhen', slug: 'shenzhen', lat: 22.5431, lon: 114.0579, nodes: 2 },
  { city: 'Beijing', slug: 'beijing', lat: 39.9042, lon: 116.4074, nodes: 2 },
  { city: 'Taipei', slug: 'taipei', lat: 25.033, lon: 121.5654, nodes: 1 },
  { city: 'Bangkok', slug: 'bangkok', lat: 13.7563, lon: 100.5018, nodes: 1 },
  { city: 'Mexico City', slug: 'mexico-city', lat: 19.4326, lon: -99.1332, nodes: 1 },
  { city: 'Sao Paulo', slug: 'sao-paulo', lat: -23.5505, lon: -46.6333, nodes: 1 },
  { city: 'Istanbul', slug: 'istanbul', lat: 41.0082, lon: 28.9784, nodes: 1 },
  { city: 'Johannesburg', slug: 'johannesburg', lat: -26.2041, lon: 28.0473, nodes: 1 },
  { city: 'Cairo', slug: 'cairo', lat: 30.0444, lon: 31.2357, nodes: 1 },
  { city: 'Nairobi', slug: 'nairobi', lat: -1.2921, lon: 36.8219, nodes: 1 },
  { city: 'Moscow', slug: 'moscow', lat: 55.7558, lon: 37.6173, nodes: 1 },
  { city: 'Buenos Aires', slug: 'buenos-aires', lat: -34.6037, lon: -58.3816, nodes: 1 },
  { city: 'Madrid', slug: 'madrid', lat: 40.4168, lon: -3.7038, nodes: 1 },
  { city: 'Rome', slug: 'rome', lat: 41.9028, lon: 12.4964, nodes: 1 },
  { city: 'Chicago', slug: 'chicago', lat: 41.8781, lon: -87.6298, nodes: 1 },
  { city: 'Seattle', slug: 'seattle', lat: 47.6062, lon: -122.3321, nodes: 1 },
  { city: 'Vancouver', slug: 'vancouver', lat: 49.2827, lon: -123.1207, nodes: 1 }
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomOffset() {
  return (Math.random() * 2 - 1) * MAX_COORD_OFFSET;
}

function randomHeading() {
  return Number((Math.random() * 360).toFixed(2));
}

function randomPast24hIso() {
  const maxMs = 24 * 60 * 60 * 1000;
  const agoMs = Math.floor(Math.random() * maxMs);
  return new Date(Date.now() - agoMs).toISOString();
}

function shortToken(token) {
  if (typeof token !== 'string' || token.length === 0) return 'n/a';
  return `${token.slice(0, 12)}...`;
}

function requestJson(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, RELAY_BASE_URL);
    const payload = body == null ? '' : JSON.stringify(body);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(
      {
        method,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers: {
          Accept: 'application/json',
          ...(body == null
            ? {}
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
              }),
          ...extraHeaders
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            parsed = { raw };
          }

          const statusCode = res.statusCode || 0;
          if (statusCode >= 200 && statusCode < 300) {
            resolve(parsed);
            return;
          }
          const err = new Error(`HTTP ${statusCode} ${method} ${path}`);
          err.response = parsed;
          reject(err);
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function registerNode(name) {
  const headers = REGISTER_SECRET ? { 'x-register-secret': REGISTER_SECRET } : {};
  return requestJson('POST', '/v1/nodes/register', { name, type: 'clawphone' }, headers);
}

function postFrame(token, city) {
  return requestJson(
    'POST',
    '/v1/events/frame',
    {
      lat: Number((city.lat + randomOffset()).toFixed(6)),
      lon: Number((city.lon + randomOffset()).toFixed(6)),
      heading: randomHeading(),
      ts: randomPast24hIso(),
      jpeg_base64: DEMO_JPEG_BASE64
    },
    { Authorization: `Bearer ${token}` }
  );
}

async function main() {
  let totalNodes = 0;
  let totalEvents = 0;
  const seededCities = new Set();

  console.log(`Seeding relay at ${RELAY_BASE_URL} ...`);

  for (const city of CITIES) {
    seededCities.add(city.city);
    for (let i = 1; i <= city.nodes; i += 1) {
      const nodeName = city.nodes === 1 ? `demo-${city.slug}` : `demo-${city.slug}-${i}`;

      const reg = await registerNode(nodeName);
      if (!reg || reg.ok !== true || typeof reg.token !== 'string') {
        throw new Error(`Failed to register ${nodeName}: ${JSON.stringify(reg)}`);
      }

      totalNodes += 1;
      const token = reg.token;
      console.log(`Registered node ${nodeName} (token: ${shortToken(token)})`);

      const eventCount = randomInt(MIN_EVENTS_PER_NODE, MAX_EVENTS_PER_NODE);
      let sent = 0;
      for (let e = 0; e < eventCount; e += 1) {
        await postFrame(token, city);
        sent += 1;
      }
      totalEvents += sent;
      console.log(`Sent ${sent} events for ${nodeName}`);
    }
  }

  const stats = await requestJson('GET', '/v1/world/stats?hours=24', null);
  const cells = await requestJson('GET', '/v1/world/cells?hours=24&limit=5000', null);

  console.log(`Seeded ${totalNodes} nodes, ${totalEvents} events across ${seededCities.size} cities`);
  if (stats && stats.ok) {
    console.log(
      `Relay stats (24h): nodes_total=${stats.nodes_total}, events_total=${stats.events_total}, unique_cells=${stats.unique_cells}`
    );
  }
  if (cells && cells.ok) {
    const returnedCells = Array.isArray(cells.cells) ? cells.cells.length : 0;
    console.log(`Relay cells (24h): unique_cells=${cells.unique_cells}, returned_cells=${returnedCells}`);
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  if (err.response) {
    console.error('Response:', JSON.stringify(err.response));
  }
  process.exitCode = 1;
});
