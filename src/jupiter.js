// Shared Jupiter API helper — applies x-api-key, normalises errors, retries transient failures.
// Retryable codes per the integrating-jupiter skill error table.
const RETRYABLE_CODES = new Set([-1, -1000, -1001, -1004, -2000, -2001, -2003, -2004, 429]);

const BASE = "/api/proxy?path=";

function apiKey() {
  return import.meta.env.VITE_JUP_API_KEY || "";
}

export async function jupiterFetch(path, init = {}) {
  const key = apiKey();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(key ? { "x-api-key": key } : {}),
      ...init.headers,
    },
  });

  if (res.status === 429) {
    const err = Object.assign(new Error("Jupiter rate limited"), { code: 429, retryable: true });
    throw err;
  }

  if (!res.ok) {
    const raw = await res.text();
    let body = { message: raw || `HTTP_${res.status}` };
    try { body = raw ? JSON.parse(raw) : body; } catch { /* keep text fallback */ }
    throw Object.assign(new Error(body.message ?? `HTTP ${res.status}`), { status: res.status, ...body });
  }

  return res.json();
}

export async function withRetry(action, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await action();
    } catch (err) {
      const retryable = err.retryable || RETRYABLE_CODES.has(err.code) || RETRYABLE_CODES.has(err.status);
      if (!retryable || attempt === maxRetries) throw err;
      const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 10_000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
