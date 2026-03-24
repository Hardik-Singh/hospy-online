/**
 * Mock transport layer — stubs globalThis.fetch so agents work without a live backend.
 * Import this at the top of any flow script to run in offline/mock mode.
 */

const API_URL = process.env.INVARIANCE_API_URL || 'https://api.invariance.dev';

let requestCount = 0;

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // Only intercept Invariance API calls
  if (!url.startsWith(API_URL)) {
    return originalFetch(input, init);
  }

  requestCount++;
  const method = init?.method ?? 'GET';
  const path = url.replace(API_URL, '');

  // Log intercepted requests in dim gray
  console.log(`  \x1b[90m[mock] ${method} ${path}\x1b[0m`);

  // Route-specific mock responses
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

  if (path.startsWith('/v1/monitors/events') && method === 'GET') {
    return json({ events: [] });
  }

  // Default: return ok
  return json({ ok: true });
};

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
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
