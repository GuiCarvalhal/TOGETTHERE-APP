// Locale-aware formatters for dates, numbers, currency, and relative time.
// The browser locale never changes stored amounts or dates — only the display
// format. Date-only strings (YYYY-MM-DD) are parsed as local calendar dates
// (not UTC) so the day is stable in every timezone. Timezone abbreviations
// (BRT, EDT, CEST) come from Intl's short timezone name — never regressed to
// GMT offsets.

export function makeFormatters(locale) {
  const dateLocale = locale || 'en-US';

  function formatDate(d, opts = { month: 'short', day: 'numeric' }) {
    if (!d) return '';
    try {
      const s = String(d);
      const dt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
      return dt.toLocaleDateString(dateLocale, opts);
    } catch { return d; }
  }

  function formatDateRange(start, end) {
    const s = formatDate(start);
    const e = formatDate(end);
    if (s && e) return `${s} – ${e}`;
    return s || e;
  }

  function formatDateTime(iso, tz) {
    if (!iso) return '';
    try {
      const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
      if (tz) { opts.timeZone = tz; opts.timeZoneName = 'short'; }
      return new Intl.DateTimeFormat(dateLocale, opts).format(new Date(iso));
    } catch { return new Date(iso).toLocaleString(dateLocale); }
  }

  function formatTime(iso, tz) {
    if (!iso) return '';
    try {
      const opts = { hour: 'numeric', minute: '2-digit' };
      if (tz) { opts.timeZone = tz; opts.timeZoneName = 'short'; }
      return new Intl.DateTimeFormat(dateLocale, opts).format(new Date(iso));
    } catch { return new Date(iso).toLocaleTimeString(dateLocale); }
  }

  function formatCurrency(amount, currency = 'USD') {
    const n = Number(amount || 0);
    try {
      return new Intl.NumberFormat(dateLocale, { style: 'currency', currency }).format(n);
    } catch {
      return `${currency} ${n.toFixed(2)}`;
    }
  }

  function formatNumber(n, opts) {
    try {
      return new Intl.NumberFormat(dateLocale, opts).format(Number(n || 0));
    } catch { return String(n); }
  }

  // Relative time: "just now", "5m ago", "3h ago", "2d ago", or a short date.
  // The unit word (minute/hour/day/week) is localized via Intl.RelativeTimeFormat.
  function timeAgo(date) {
    const d = new Date(date);
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(dateLocale, { numeric: 'auto' });
    if (s < 45) return rtf.format(0, 'second');
    const m = Math.floor(s / 60);
    if (m < 60) return rtf.format(-m, 'minute');
    const h = Math.floor(m / 60);
    if (h < 24) return rtf.format(-h, 'hour');
    const days = Math.floor(h / 24);
    if (days < 7) return rtf.format(-days, 'day');
    const w = Math.floor(days / 7);
    if (w < 5) return rtf.format(-w, 'week');
    return d.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });
  }

  // Relative time forward: "in 3 days", "tomorrow", "today" — for trip status.
  function timeUntil(days) {
    const rtf = new Intl.RelativeTimeFormat(dateLocale, { numeric: 'auto' });
    if (days <= 0) return rtf.format(0, 'day');
    return rtf.format(days, 'day');
  }

  return { formatDate, formatDateRange, formatDateTime, formatTime, formatCurrency, formatNumber, timeAgo, timeUntil, locale: dateLocale };
}