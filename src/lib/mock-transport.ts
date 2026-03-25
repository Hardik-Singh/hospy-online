/**
 * Mock transport layer — stubs globalThis.fetch so agents work without a live backend.
 * Import this at the top of any flow script to run in offline/mock mode.
 */

import type { Monitor, MonitorSignal, MonitorEvaluateResult } from '@invariance/sdk';

const API_URL = process.env.INVARIANCE_API_URL || 'https://api.invariance.dev';

let requestCount = 0;

// ── Stateful mock store for monitors ──

const mockMonitors = new Map<string, Monitor>();
const mockSignals: MonitorSignal[] = [];

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // Only intercept Invariance API calls
  if (!url.startsWith(API_URL)) {
    return originalFetch(input, init);
  }

  requestCount++;
  const method = init?.method ?? 'GET';
  const parsed = new URL(url);
  const path = parsed.pathname;

  // Log intercepted requests in dim gray
  console.log(`  \x1b[90m[mock] ${method} ${path}\x1b[0m`);

  // ── Monitor routes (most-specific first) ──

  // POST /v1/monitors/compile-preview
  if (path === '/v1/monitors/compile-preview' && method === 'POST') {
    const body = parseBody(init);
    return json({
      compiled: {
        type: 'nl_rule',
        source: body?.rule ?? '',
        ast: { op: 'match', pattern: body?.rule ?? '' },
      },
    });
  }

  // POST /v1/monitors/evaluate-all
  if (path === '/v1/monitors/evaluate-all' && method === 'POST') {
    const results: MonitorEvaluateResult[] = [];
    for (const [id, monitor] of mockMonitors) {
      if (monitor.status !== 'active') continue;
      const result = evaluateMonitorMock(id, monitor);
      results.push(result);
    }
    return json(results);
  }

  // POST /v1/monitors/:id/evaluate
  if (/^\/v1\/monitors\/[^/]+\/evaluate$/.test(path) && method === 'POST') {
    const id = path.split('/')[3]!;
    const monitor = mockMonitors.get(id);
    if (!monitor) return jsonError(404, 'Monitor not found');
    const result = evaluateMonitorMock(id, monitor);
    return json(result);
  }

  // PATCH /v1/monitors/events/:id/acknowledge
  if (/^\/v1\/monitors\/events\/[^/]+\/acknowledge$/.test(path) && method === 'PATCH') {
    const eventId = path.split('/')[4]!;
    const signal = mockSignals.find((s) => s.id === eventId);
    if (!signal) return jsonError(404, 'Event not found');
    signal.acknowledged = true;
    return json({ id: signal.id, acknowledged: true });
  }

  // GET /v1/monitors/events
  if (path === '/v1/monitors/events' && method === 'GET') {
    let filtered = [...mockSignals];

    const monitorId = parsed.searchParams.get('monitor_id');
    if (monitorId) filtered = filtered.filter((s) => s.monitor_id === monitorId);

    const ack = parsed.searchParams.get('acknowledged');
    if (ack === 'true') filtered = filtered.filter((s) => s.acknowledged);
    if (ack === 'false') filtered = filtered.filter((s) => !s.acknowledged);

    const afterId = parsed.searchParams.get('after_id');
    if (afterId) {
      const idx = filtered.findIndex((s) => s.id === afterId);
      if (idx !== -1) filtered = filtered.slice(idx + 1);
    }

    const limit = parseInt(parsed.searchParams.get('limit') ?? '100', 10);
    const page = filtered.slice(0, limit);
    const nextCursor = page.length === limit && page.length < filtered.length ? page[page.length - 1]!.id : null;

    return json({ events: page, next_cursor: nextCursor });
  }

  // POST /v1/monitors (create)
  if (path === '/v1/monitors' && method === 'POST') {
    const body = parseBody(init);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const monitor: Monitor = {
      id,
      name: String(body?.name ?? 'Unnamed Monitor'),
      natural_language: String(body?.natural_language ?? ''),
      compiled_condition: null,
      agent_id: (body?.agent_id as string) ?? null,
      owner_id: 'hospy-mock-owner',
      status: 'active',
      severity: (body?.severity as Monitor['severity']) ?? 'medium',
      webhook_url: (body?.webhook_url as string) ?? null,
      created_at: now,
      updated_at: now,
    };
    mockMonitors.set(id, monitor);
    return json(monitor);
  }

  // GET /v1/monitors/:id
  if (/^\/v1\/monitors\/[^/]+$/.test(path) && method === 'GET') {
    const id = path.split('/')[3]!;
    const monitor = mockMonitors.get(id);
    if (!monitor) return jsonError(404, 'Monitor not found');
    return json(monitor);
  }

  // PATCH /v1/monitors/:id
  if (/^\/v1\/monitors\/[^/]+$/.test(path) && method === 'PATCH') {
    const id = path.split('/')[3]!;
    const monitor = mockMonitors.get(id);
    if (!monitor) return jsonError(404, 'Monitor not found');
    const body = parseBody(init);
    if (body) {
      if (body.name !== undefined) monitor.name = String(body.name);
      if (body.natural_language !== undefined) monitor.natural_language = String(body.natural_language);
      if (body.status !== undefined) monitor.status = body.status as Monitor['status'];
      if (body.severity !== undefined) monitor.severity = body.severity as Monitor['severity'];
      if (body.webhook_url !== undefined) monitor.webhook_url = body.webhook_url as string | null;
      if (body.agent_id !== undefined) monitor.agent_id = body.agent_id as string | null;
      monitor.updated_at = new Date().toISOString();
    }
    return json(monitor);
  }

  // DELETE /v1/monitors/:id
  if (/^\/v1\/monitors\/[^/]+$/.test(path) && method === 'DELETE') {
    const id = path.split('/')[3]!;
    mockMonitors.delete(id);
    return json({ ok: true });
  }

  // GET /v1/monitors (list)
  if (path === '/v1/monitors' && method === 'GET') {
    let monitors = [...mockMonitors.values()];
    const status = parsed.searchParams.get('status');
    if (status) monitors = monitors.filter((m) => m.status === status);
    const agentId = parsed.searchParams.get('agent_id');
    if (agentId) monitors = monitors.filter((m) => m.agent_id === agentId);
    return json(monitors);
  }

  // ── Existing non-monitor routes ──

  if (path.startsWith('/v1/sessions') && method === 'POST') {
    return json({ id: crypto.randomUUID(), ok: true });
  }

  if (path.startsWith('/v1/receipts/batch') && method === 'POST') {
    return json({ ok: true, count: 0 });
  }

  if (path.includes('/close') && method === 'PUT') {
    return json({ ok: true });
  }

  if (path.startsWith('/v1/contracts') && method === 'POST') {
    return json({ id: crypto.randomUUID(), sessionId: crypto.randomUUID() });
  }

  if (path.includes('/accept') && method === 'PUT') {
    return json({ id: extractId(path), status: 'accepted' });
  }

  if (path.includes('/deliver') && method === 'POST') {
    return json({ id: crypto.randomUUID(), status: 'pending' });
  }

  if (path.includes('/deliveries/') && path.includes('/accept') && method === 'PUT') {
    return json({ id: extractId(path), status: 'settled' });
  }

  if (path.includes('/dispute') && method === 'POST') {
    return json({ id: extractId(path), status: 'disputed' });
  }

  if (path.startsWith('/v1/identity') && method === 'POST') {
    return json({ owner: 'hospy', name: 'agent', public_key: '0'.repeat(64), agent_id: crypto.randomUUID(), created_at: new Date().toISOString() });
  }

  if (path.startsWith('/v1/health')) {
    return json({ ok: true });
  }

  if (path.startsWith('/v1/trace') && method === 'POST') {
    return json({ ok: true });
  }

  // Default: return ok
  return json({ ok: true });
};

// ── Mock helpers ──

function evaluateMonitorMock(monitorId: string, monitor: Monitor): MonitorEvaluateResult {
  // Deterministic synthetic matching: generate a signal for nurse vitals monitors
  // to simulate the backend finding matching trace data.
  const nl = monitor.natural_language.toLowerCase();
  const isVitalsRule =
    nl.includes('heart rate') || nl.includes('oxygen') || nl.includes('blood pressure') || nl.includes('temperature');

  const matchCount = isVitalsRule ? 1 : 0;
  const matchedNodeIds: string[] = [];

  if (matchCount > 0) {
    const nodeId = `node-${crypto.randomUUID().slice(0, 8)}`;
    matchedNodeIds.push(nodeId);

    // Create a synthetic signal for matched monitors
    const signal: MonitorSignal = {
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      monitor_id: monitorId,
      monitor_name: monitor.name,
      node_id: nodeId,
      session_id: `sess-mock-${crypto.randomUUID().slice(0, 8)}`,
      agent_id: monitor.agent_id ?? 'unknown',
      severity: monitor.severity,
      message: `Monitor "${monitor.name}" triggered: ${monitor.natural_language}`,
      acknowledged: false,
      created_at: new Date().toISOString(),
    };
    mockSignals.push(signal);
  }

  return {
    monitor_id: monitorId,
    matches_found: matchCount,
    matched_node_ids: matchedNodeIds,
  };
}

function parseBody(init?: RequestInit): Record<string, unknown> | null {
  if (!init?.body) return null;
  try {
    return JSON.parse(init.body as string);
  } catch {
    return null;
  }
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function extractId(path: string): string {
  const parts = path.split('/');
  // Find the segment after 'contracts' or similar
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'contracts' || parts[i] === 'deliveries') {
      if (parts[i + 1] && !['accept', 'deliver', 'dispute', 'close'].includes(parts[i + 1])) {
        return parts[i + 1];
      }
    }
  }
  return crypto.randomUUID();
}

/** Get the total number of mock requests intercepted */
export function getMockRequestCount(): number {
  return requestCount;
}

/** Reset mock request counter */
export function resetMockRequestCount(): void {
  requestCount = 0;
}
