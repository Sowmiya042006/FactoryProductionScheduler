/**
 * src/api/client.js
 * Thin fetch wrapper. Throws a typed ApiError on any non-2xx response
 * or network failure so callers never see raw fetch rejections.
 *
 * All functions return { data } from the server's { ok: true, data } envelope.
 */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name    = 'ApiError';
    this.status  = status;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body:    body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Make sure the backend is running.', 0);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Server returned an unexpected response (${res.status}).`, res.status);
  }

  if (!res.ok || !json.ok) {
    throw new ApiError(json.error ?? `Request failed (${res.status}).`, res.status);
  }

  return json.data;
}

// ─── API surface ──────────────────────────────────────────────────────────────

export const api = {
  health:    ()         => request('GET',    '/health'),
  lines:     ()         => request('GET',    '/lines'),
  products:  ()         => request('GET',    '/products'),
  changeovers: ()       => request('GET',    '/changeovers'),

  getOrders:    ()      => request('GET',    '/orders'),
  createOrder:  (body)  => request('POST',   '/orders',      body),
  updateOrder:  (id, b) => request('PUT',    `/orders/${id}`, b),
  deleteOrder:  (id)    => request('DELETE', `/orders/${id}`),

  getSettings:  ()      => request('GET',    '/settings'),
  updateSettings: (b)   => request('PUT',    '/settings',    b),

  generateSchedule: ()  => request('POST',   '/schedules'),
  latestSchedule:   ()  => request('GET',    '/schedules/latest'),
  getSchedule: (id)     => request('GET',    `/schedules/${id}`),

  demoReset:  ()        => request('POST',   '/demo/reset'),
  importData: (orders)  => request('POST',   '/demo/import', { orders }),
};
