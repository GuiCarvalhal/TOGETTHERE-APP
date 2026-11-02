const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayIso(dateOnly: string) {
  return `${dateOnly}T00:00:00.000Z`;
}

function endOfDayIso(dateOnly: string) {
  return `${dateOnly}T23:59:59.999Z`;
}

function toMs(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeText(v: unknown) {
  return (typeof v === 'string' ? v : '').trim();
}

function normalizeTextLower(v: unknown) {
  return normalizeText(v).toLowerCase();
}

export function normalizeEmail(v: unknown) {
  if (typeof v !== 'string') return '';
  const s = v.trim().toLowerCase();
  if (!s.includes('@')) return '';
  return s;
}

export function extractPlainTextFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildInboundText(payload: any) {
  const direct =
    normalizeText(payload?.text) ||
    normalizeText(payload?.bodyText) ||
    normalizeText(payload?.plainText) ||
    normalizeText(payload?.contentText);
  if (direct) return direct;
  const html = normalizeText(payload?.bodyHtml) || normalizeText(payload?.html) || normalizeText(payload?.body);
  if (html) return extractPlainTextFromHtml(html);

  const attachmentText = Array.isArray(payload?.attachments)
    ? payload.attachments
      .map((a: any) => normalizeText(a?.textContent) || normalizeText(a?.contentText))
      .filter(Boolean)
      .join('\n\n')
    : '';
  return attachmentText;
}

export function deriveGatheringWindow(gathering: any, items: any[]) {
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const it of items || []) {
    const s = toMs(it?.start_datetime);
    const e = toMs(it?.end_datetime);
    if (s !== null) minMs = Math.min(minMs, s);
    if (e !== null) maxMs = Math.max(maxMs, e);
    if (s !== null && e === null) maxMs = Math.max(maxMs, s);
  }
  if (Number.isFinite(minMs) && Number.isFinite(maxMs)) return { startMs: minMs, endMs: maxMs };

  const fallbackStart = normalizeText(gathering?.start_date);
  const fallbackEnd = normalizeText(gathering?.end_date);
  const s = fallbackStart ? toMs(startOfDayIso(fallbackStart)) : null;
  const e = fallbackEnd ? toMs(endOfDayIso(fallbackEnd)) : null;
  if (s !== null || e !== null) {
    return { startMs: s ?? e!, endMs: e ?? s! };
  }
  return null;
}

function hasDestinationSignal(gathering: any, normalizedHaystack: string) {
  const names = [
    ...((gathering?.destination_places || []).map((p: any) => p?.name).filter(Boolean)),
    ...((gathering?.destinations || []).filter(Boolean)),
  ]
    .map((x: string) => x.toLowerCase().trim())
    .filter((x: string) => x.length >= 3);
  return names.some((name: string) => normalizedHaystack.includes(name) || name.includes(normalizedHaystack));
}

export function scoreGatheringForDraft(draft: any, gathering: any, items: any[]) {
  const startMs = toMs(draft?.start_datetime);
  const endMs = toMs(draft?.end_datetime) ?? startMs;
  const window = deriveGatheringWindow(gathering, items);
  let score = 0;
  const reasons: string[] = [];

  if (startMs !== null && endMs !== null && window) {
    const expandedStart = window.startMs - (2 * DAY_MS);
    const expandedEnd = window.endMs + (2 * DAY_MS);
    if (startMs >= expandedStart && endMs <= expandedEnd) {
      score += 4;
      reasons.push('date-within-window');
    } else {
      const center = (window.startMs + window.endMs) / 2;
      const distDays = Math.abs(startMs - center) / DAY_MS;
      if (distDays <= 14) {
        score += 2;
        reasons.push('date-near-window');
      } else if (distDays <= 45) {
        score += 1;
        reasons.push('date-loose-match');
      }
    }
  }

  const haystack = [
    normalizeTextLower(draft?.location_to),
    normalizeTextLower(draft?.location_name),
    normalizeTextLower(draft?.location_from),
    normalizeTextLower(draft?.title),
  ].filter(Boolean).join(' ');
  if (haystack && hasDestinationSignal(gathering, haystack)) {
    score += 1;
    reasons.push('destination-match');
  }

  return { score, reason: reasons.join(',') };
}

export function chooseGatheringMatch(draft: any, gatherings: any[], itemsByGathering: Record<string, any[]>) {
  const scored = (gatherings || []).map((g) => {
    const { score, reason } = scoreGatheringForDraft(draft, g, itemsByGathering[g.id] || []);
    return { gathering: g, score, reason };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0] || null;
  const second = scored[1] || null;
  const confident = !!best && best.score >= 4 && (!second || (best.score - second.score) >= 2);
  const suggested = best && best.score > 0 ? best.gathering.id : null;
  const candidates = scored.filter((s) => s.score > 0).slice(0, 5).map((s) => s.gathering.id);
  return {
    confident,
    suggestedGatheringId: suggested,
    topScore: best ? best.score : 0,
    reason: best?.reason || '',
    candidateGatheringIds: candidates.length ? candidates : (gatherings || []).slice(0, 5).map((g) => g.id),
  };
}

export function normalizeUserKeys(userId: string, userEmail: string) {
  const keys = new Set<string>();
  if (normalizeText(userId)) keys.add(normalizeText(userId));
  const email = normalizeEmail(userEmail);
  if (email) keys.add(email);
  return [...keys];
}

export function isParticipantRole(role: string) {
  return role === 'owner' || role === 'admin' || role === 'member';
}

function normalizeCode(value: unknown) {
  return normalizeTextLower(value).replace(/[^a-z0-9]/g, '');
}

function dayKey(value: unknown) {
  const text = normalizeText(value);
  return text.length >= 10 ? text.slice(0, 10) : '';
}

function fingerprintLabel(source: any) {
  return normalizeTextLower(
    source?.location_name || source?.title || source?.airline || source?.vendor || '',
  ).replace(/\s+/g, ' ');
}

// Identity keys for "the same booking, mentioned again". Two shapes:
//   ref:<type>|<reference>|<day>        — thread updates that repeat the reference
//   slot:<type>|<label>|<start>|<end>   — updates carrying no code for the same slot
// Two records match when they share ANY key, so a draft that knows the reference
// still matches an item stored before that reference was available.
export function bookingFingerprints(source: any): string[] {
  const type = normalizeTextLower(source?.type) || 'other';
  const reference = normalizeCode(source?.booking_reference) || normalizeCode(source?.pnr);
  const start = normalizeText(source?.start_datetime).slice(0, 16);
  const end = normalizeText(source?.end_datetime).slice(0, 16) || start;
  const keys: string[] = [];
  if (reference.length >= 4 && start.length >= 10) keys.push(`ref:${type}|${reference}|${dayKey(start)}`);
  const label = fingerprintLabel(source);
  if (label.length >= 4 && start.length >= 10) keys.push(`slot:${type}|${label}|${start}|${end}`);
  return keys;
}

export function bookingFingerprint(source: any) {
  return bookingFingerprints(source)[0] || '';
}

// Primary: same confirmation/code. Secondary: same booking reference, then a
// shared fingerprint (thread update with no code, same type + label + slot).
export function findDuplicateItem(existingItems: any[], draft: any) {
  const items = existingItems || [];
  const code = normalizeText(draft?.confirmation_number);
  if (code) {
    const hit = items.find((it) => normalizeText(it?.confirmation_number) === code);
    if (hit) return { item: hit, reason: 'confirmation_number' };
  }

  const reference = normalizeCode(draft?.booking_reference);
  if (reference.length >= 4) {
    const hit = items.find((it) => normalizeCode(it?.booking_reference) === reference);
    if (hit) return { item: hit, reason: 'booking_reference' };
  }

  const keys = bookingFingerprints(draft);
  if (keys.length) {
    const hit = items.find((it) => bookingFingerprints(it).some((key) => keys.includes(key)));
    if (hit) return { item: hit, reason: 'fingerprint' };
  }

  return null;
}

// Try several representations of the same booking (the adapted standard payload
// first, then the raw draft for rows stored before adaptation existed). Any hit
// means the booking is already in the journey.
export function findDuplicateForItem(existingItems: any[], candidates: any[]) {
  for (const candidate of candidates || []) {
    if (!candidate) continue;
    const hit = findDuplicateItem(existingItems, candidate);
    if (hit) return hit;
  }
  return null;
}