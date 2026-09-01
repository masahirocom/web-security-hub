'use strict';

/** Thin JSON fetch wrapper for the /api/* REST endpoints (not the SSE ones — those use EventSource directly). */
export async function api(path, opts) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed: ${res.status}`);
  return data;
}
