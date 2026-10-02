import { FLIGHT_ENRICHMENT_VERSION } from '@/lib/flightEnrichmentInput';

// Only nonempty known values are retained. Outcomes have a cooldown, not a permanent failed set.
export default function createFlightEnrichmentCache(invoke, now = Date.now) {
  const entries = new Map();
  const inflight = new Map();
  const valueFields = ['airline', 'from_city', 'to_city', 'from_country', 'to_country'];
  const successTtl = 600000;
  return async function load(key, payload) {
    if (inflight.has(key)) return inflight.get(key);
    let entry = entries.get(key);
    if (!entry) entry = { values: {}, attempts: 0, updated: 0, knownAt: 0 };
    if (entry.updated && now() < entry.nextAllowed) return { ...entry.values, ...entry.outcome };
    if (entry.updated && !entry.outcome.retryAt) entry.attempts = 0;
    if (entry.knownAt && now() - entry.knownAt >= successTtl) entry.values = {};
    entry.attempts++;
    const request = (async () => {
      let warnings = [];
      let errors = [];
      try {
        const response = await invoke(payload);
        const data = response.data;
        if (data?.version !== FLIGHT_ENRICHMENT_VERSION || !valueFields.every(field => typeof data[field] === 'string') || !Array.isArray(data.errors) || !Array.isArray(data.warnings)) {
          throw Object.assign(new Error('Flight detail response could not be verified.'), { retryable: true });
        }
        for (const field of valueFields) if (data[field].trim()) entry.values[field] = data[field];
        if (valueFields.some(field => data[field].trim())) entry.knownAt = now();
        warnings = data.warnings;
        errors = data.errors;
      } catch (error) {
        const status = error.response?.status;
        errors = [{ field: 'metadata', source: 'enrichment', code: status ? `HTTP_${status}` : 'REQUEST_FAILED', message: 'Flight details could not be refreshed.', retryable: error.retryable ?? (!status || status === 429 || status >= 500) }];
      }
      const retryable = errors.some(issue => issue.retryable && (issue.field === 'metadata' || !entry.values[issue.field] ||
        (issue.source === 'aerodatabox.flight' && (!entry.values.from_city || !entry.values.to_city))));
      const retryAt = retryable && entry.attempts < 3 ? now() + (entry.attempts === 1 ? 30000 : 60000) : 0;
      const complete = valueFields.every(field => !!entry.values[field]) && !warnings.length && !errors.length;
      entry.updated = now();
      entry.nextAllowed = retryAt || now() + (complete ? successTtl : retryable ? 300000 : 60000);
      entry.outcome = { warnings, errors, retryAt };
      entries.set(key, entry);
      if (entries.size > 128) entries.delete(entries.keys().next().value);
      return { ...entry.values, ...entry.outcome };
    })().finally(() => inflight.delete(key));
    inflight.set(key, request);
    return request;
  };
}