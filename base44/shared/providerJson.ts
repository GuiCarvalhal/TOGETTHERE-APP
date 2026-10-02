// Provider failures are never equivalent to a verified empty result.
export class ProviderFailure extends Error {
  constructor(source, code, message, retryable, httpStatus = null) {
    super(message);
    this.source = source;
    this.code = code;
    this.retryable = retryable;
    this.http_status = httpStatus;
  }
}

export async function providerJson(url, options, source, fetcher = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetcher(url, { ...options, signal: AbortSignal.timeout(8000) });
    } catch {
      if (attempt === 0) { await new Promise(resolve => setTimeout(resolve, 1200)); continue; }
      throw new ProviderFailure(source, 'NETWORK_ERROR', 'Provider connection failed or timed out.', true);
    }
    if (response.status === 404 || response.status === 204) return null;
    const transient = response.status === 429 || response.status >= 500;
    if (transient && attempt === 0) {
      const retryAfter = Number(response.headers.get('retry-after')) * 1000;
      await new Promise(resolve => setTimeout(resolve, Math.min(3000, Math.max(1200, retryAfter || 0))));
      continue;
    }
    if (!response.ok) {
      throw new ProviderFailure(source, response.status === 429 ? 'RATE_LIMITED' : `HTTP_${response.status}`,
        response.status === 429 ? 'Provider rate limit reached.' : `Provider returned HTTP ${response.status}.`, transient, response.status);
    }
    let data;
    try { data = await response.json(); }
    catch { throw new ProviderFailure(source, 'INVALID_JSON', 'Provider returned invalid JSON.', true, response.status); }
    if (data === null) throw invalidProviderShape(source);
    return data;
  }
}

export function invalidProviderShape(source) {
  return new ProviderFailure(source, 'INVALID_SHAPE', 'Provider returned an unexpected response shape.', true);
}