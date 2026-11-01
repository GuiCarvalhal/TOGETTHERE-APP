// Deterministic reservation classifier.
//
// ONE place turns a raw email (subject + body) into a JourneyItem-shaped draft
// plus a confidence score. Every entry point (inbound webhook, Gmail, Outlook,
// Yahoo, iCloud) goes through ingestReservationMessage(), which calls this
// module first — so no provider (and no connector) can ever parse reservations
// on its own and drift from the others.
//
// Design rules
// - Rules first, precision over recall. An email is only auto-created when the
//   evidence for ONE item type is strong (see RESERVATION_CONFIDENCE_POLICY).
// - Everything is bilingual: EN + PT-BR vocabulary, accents folded away before
//   matching so "estação" and "estacao" behave identically.
// - Datetimes are emitted as wall-clock "YYYY-MM-DDTHH:MM" exactly as written
//   in the email. No timezone maths happens here; downstream flight enrichment
//   resolves real airport timezones and the UI renders in the place's zone.
// - Signals are CODES only ("pnr", "checkin_checkout"), safe to log or store:
//   they never carry message content.
// - AI is an opt-in fallback for ambiguous messages (flag OFF by default, see
//   isReservationAiFallbackEnabled) and can only ever produce a PENDING import,
//   never an automatic item.

import { normalizeDraft } from './extractJourneyDraft.ts';

export type ReservationType = 'flight' | 'hotel' | 'train' | 'car' | 'activity' | 'other';

// ---------------------------------------------------------------------------
// Confidence policy — the single source of truth for what happens to a message.
// Tune here; nothing else in the pipeline hardcodes a threshold.
// ---------------------------------------------------------------------------
export const RESERVATION_CONFIDENCE_POLICY = {
  // >= AUTO_CREATE_MIN: the type is trusted, so an item may be created
  //   automatically once the gathering match is also confident.
  AUTO_CREATE_MIN: 0.75,
  // >= PENDING_MIN (and below AUTO_CREATE_MIN): usable but not trusted enough
  //   to create silently → queued as a pending import suggestion on Home.
  PENDING_MIN: 0.4,
  // Below MIN_TYPE_SCORE no type is claimed at all (it stays "other").
  MIN_TYPE_SCORE: 2.5,
  // Raw evidence score that maps to full confidence.
  SATURATION_SCORE: 6,
  // A competing type at >= this share of the winner trims the winner's score,
  // so an email that looks like a flight AND a hotel never auto-creates.
  COMPETITOR_SHARE: 0.6,
  // No start datetime → never trusted for auto-create (an undated item is not
  // useful on a timeline), regardless of how strong the wording is.
  NO_DATE_CONFIDENCE_CAP: 0.65,
} as const;

// Feature flag for the optional LLM fallback. OFF unless this env var is the
// literal "true"; absent secret = fully deterministic behaviour.
export const RESERVATION_AI_FALLBACK_ENV = 'RESERVATION_AI_FALLBACK';

export function isReservationAiFallbackEnabled() {
  try {
    const raw = process.env?.[RESERVATION_AI_FALLBACK_ENV];
    return String(raw || '').trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

export type PolicyOutcome = 'auto_create' | 'pending' | 'ignore';

export type ReservationFields = {
  pnr: string;
  booking_code: string;
  vendor: string;
  amount: number | null;
  currency: string;
  nights: number | null;
  from: string;
  to: string;
  venue: string;
};

export type ReservationClassification = {
  type: ReservationType;
  confidence: number;
  score: number;
  signals: string[];
  denied: boolean;
  denyCode: string;
  reason: string;
  draft: any;
  fields: ReservationFields;
};

// ---------------------------------------------------------------------------
// Text folding (accent-insensitive, length-preserving)
// ---------------------------------------------------------------------------
const ACCENT_PAIRS: Array<[string, string]> = [
  ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ã', 'a'], ['ä', 'a'], ['å', 'a'],
  ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
  ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'],
  ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['õ', 'o'], ['ö', 'o'],
  ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'],
  ['ç', 'c'], ['ñ', 'n'], ['ý', 'y'], ['ÿ', 'y'],
];
const ACCENT_MAP = new Map<string, string>(ACCENT_PAIRS);

function foldChar(ch: string) {
  const direct = ACCENT_MAP.get(ch);
  if (direct) return direct;
  const lower = ch.toLowerCase();
  return ACCENT_MAP.get(lower) || lower;
}

function foldText(value: unknown) {
  const text = typeof value === 'string' ? value : '';
  let out = '';
  for (const ch of text) out += foldChar(ch);
  return out;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// ---------------------------------------------------------------------------
// Dates + times
// ---------------------------------------------------------------------------
const MONTHS: Record<string, number> = {};
function addMonths(index: number, names: string[]) {
  for (const name of names) MONTHS[name] = index;
}
addMonths(1, ['jan', 'january', 'janeiro']);
addMonths(2, ['feb', 'february', 'fevereiro']);
addMonths(3, ['mar', 'march', 'marco']);
addMonths(4, ['apr', 'april', 'abril']);
addMonths(5, ['may', 'maio', 'mai']);
addMonths(6, ['jun', 'june', 'junho']);
addMonths(7, ['jul', 'july', 'julho']);
addMonths(8, ['aug', 'august', 'agosto']);
addMonths(9, ['sep', 'sept', 'september', 'setembro', 'set']);
addMonths(10, ['oct', 'october', 'outubro', 'out']);
addMonths(11, ['nov', 'november', 'novembro']);
addMonths(12, ['dec', 'december', 'dezembro', 'dez']);

export type DateTimeHit = { index: number; value: string; hasTime: boolean };

function validYmd(y: number, m: number, d: number) {
  return y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

// US style only when the text proves it: an AM/PM clock or a "November 2, 2026"
// date. Otherwise numeric dates are read day-first (PT-BR and most of the
// world write 02/11/2026 for 2 November).
function prefersMonthFirst(text: string) {
  if (/\b(a\.?m\.?|p\.?m\.)\b/.test(text)) return true;
  if (/\b[a-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/.test(text)) return true;
  return false;
}

export function findDateHits(text: string): DateTimeHit[] {
  const hits: DateTimeHit[] = [];
  const monthFirst = prefersMonthFirst(text);
  const add = (index: number, value: string) => {
    if (hits.some((h) => Math.abs(h.index - index) <= 3)) return;
    hits.push({ index, value, hasTime: false });
  };

  let m: RegExpExecArray | null;

  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = iso.exec(text))) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (validYmd(y, mo, d)) add(m.index, `${y}-${pad2(mo)}-${pad2(d)}`);
  }

  const numeric = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g;
  while ((m = numeric.exec(text))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { day = b; month = a; }
    else if (monthFirst) { month = a; day = b; }
    else { day = a; month = b; }
    if (validYmd(y, month, day)) add(m.index, `${y}-${pad2(month)}-${pad2(day)}`);
  }

  // "2 November 2026", "2 de novembro de 2026"
  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:de\s+)?([a-z]{3,9})\.?,?\s+(?:de\s+)?(\d{4})\b/g;
  while ((m = dayFirst.exec(text))) {
    const month = MONTHS[m[2]];
    const day = Number(m[1]);
    const y = Number(m[3]);
    if (month && validYmd(y, month, day)) add(m.index, `${y}-${pad2(month)}-${pad2(day)}`);
  }

  // "November 2, 2026", "novembro 2 de 2026"
  const monthFirstDate = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(?:de\s+)?(\d{4})\b/g;
  while ((m = monthFirstDate.exec(text))) {
    const month = MONTHS[m[1]];
    const day = Number(m[2]);
    const y = Number(m[3]);
    if (month && validYmd(y, month, day)) add(m.index, `${y}-${pad2(month)}-${pad2(day)}`);
  }

  return hits.sort((x, y) => x.index - y.index);
}

type TimeHit = { index: number; hhmm: string };

function findTimeHits(text: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const add = (index: number, rawHour: number, rawMinute: number, ampm = '') => {
    let hour = rawHour;
    const minute = rawMinute;
    if (ampm) {
      const isPm = ampm.startsWith('p');
      if (hour === 12) hour = isPm ? 12 : 0;
      else if (isPm) hour += 12;
    }
    if (!(hour >= 0 && hour <= 23) || !(minute >= 0 && minute <= 59)) return;
    if (hits.some((h) => Math.abs(h.index - index) <= 2)) return;
    hits.push({ index, hhmm: `${pad2(hour)}:${pad2(minute)}` });
  };

  let m: RegExpExecArray | null;

  const clock = /\b(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/g;
  while ((m = clock.exec(text))) add(m.index, Number(m[1]), Number(m[2]), (m[3] || '').replace(/\./g, ''));

  // PT style 14h30 — minutes are required so "2 horas" never reads as 02:00.
  const ptClock = /\b(\d{1,2})h(\d{2})\b/g;
  while ((m = ptClock.exec(text))) add(m.index, Number(m[1]), Number(m[2]));

  const bareAmPm = /\b(\d{1,2})\s*(am|pm)\b/g;
  while ((m = bareAmPm.exec(text))) add(m.index, Number(m[1]), 0, m[2]);

  return hits.sort((x, y) => x.index - y.index);
}

// Merges dates with the clock time written next to them. A time AFTER the date
// always wins, so on a two-line "Departure 12 Mar 09:35 / Arrival 12 Mar 13:20"
// block the departure clock never leaks into the arrival date.
export function findDateTimes(text: string): DateTimeHit[] {
  const dates = findDateHits(text);
  const times = findTimeHits(text);
  for (const date of dates) {
    const after = times.find((t) => t.index >= date.index && t.index <= date.index + 70);
    const before = times.filter((t) => t.index < date.index && t.index >= date.index - 30);
    const near = after || before[before.length - 1];
    if (near) {
      date.value = `${date.value}T${near.hhmm}`;
      date.hasTime = true;
    }
  }
  return dates;
}

function pickDateNear(hits: DateTimeHit[], anchor: number) {
  if (!hits.length) return '';
  if (anchor < 0) return hits[0].value;
  const after = hits.filter((h) => h.index >= anchor && h.index - anchor <= 160);
  if (after.length) return after[0].value;
  const before = hits.filter((h) => h.index <= anchor);
  if (before.length) return before[before.length - 1].value;
  return hits[0].value;
}

function labelIndex(text: string, re: RegExp) {
  const m = text.match(re);
  return m && typeof m.index === 'number' ? m.index : -1;
}

// ---------------------------------------------------------------------------
// Signal vocabulary (folded: lowercase, no accents)
// ---------------------------------------------------------------------------
const FLIGHT_TERMS = /\b(flight|flights|voo|voos|boarding|embarque|itinerary|itinerario|e-?ticket|passagem\s+aerea|passagens\s+aereas|airline|companhia\s+aerea|aerea)\b/;
const REFERENCE_LABEL = /\b(record\s+locator|booking\s+reference|reservation\s+(?:code|number)|confirmation\s+(?:code|number)|confirmation|order\s+(?:code|number|id)|book\s+reference|pnr|localizador|codigo\s+de\s+reserva|codigo\s+do\s+pedido|referencia\s+da\s+reserva|numero\s+da\s+reserva)\b/;
const FLIGHT_NUMBER_LABEL = /\b(flight|voo|flt|vuelo)\b[^a-z0-9\n]{0,12}([a-z0-9]{2})\s?(\d{1,4})\b/;
const DEPART_ARRIVE = /\b(departure|departures|departs|departing|arrival|arrivals|arrives|partida|partidas|parte|chegada|chegadas|chega|embarque|desembarque)\b/;
const AIRPORT_TERMS = /\b(airport|aeroporto|gate|portao|boarding\s+pass|cartao\s+de\s+embarque|terminal\s+\d)\b/;
const BOARDING_TERMS = /\b(boarding\s+pass|cartao\s+de\s+embarque|seat\s+\d{1,3}\s?[a-f]\b|assento\s+\d{1,3}\s?[a-f]?)\b/;

const CHECKIN = /\bcheck[\s-]?in\b/;
const CHECKOUT = /\bcheck[\s-]?out\b/;
const NIGHTS = /\b(\d{1,3})\s*(nights?|noites?|noite|diarias?)\b/;
const HOTEL_TERMS = /\b(hotel|hotels|resort|pousada|hostel|hospedagem|accommodation|apart(?:ament)?o|airbnb|booking\.com|expedia|suite|quarto|room|chalet|villa)\b/;
const ADDRESS_TERMS = /\b(street|avenue|avenida|rua|address|endereco|cep|zip\s+code|postcode|c\/\s?o)\b/;
const GUEST_TERMS = /\b(guest|guests|hospede|hospedes|room\s+type|tipo\s+de\s+quarto|reservation\s+for)\b/;

const RAIL_TERMS = /\b(train|trains|trem|trens|comboio|rail|railway|ferroviari[ao]|amtrak|renfe|trenitalia|italo|eurostar|thalys|sncf|cp\s+comboios)\b/;
const BUS_TERMS = /\b(bus|onibus|coach|coaches|autocarro|autobus|flixbus|rede\s+expressos|rodoviari[ao])\b/;
const STATION_TERMS = /\b(station|stations|estacao|estacoes|platform|plataforma|binario|terminal\s+rodoviario|central\s+station|gare)\b/;
const SEAT_TERMS = /\b(carriage|carruagem|vagao|poltrona|assento|seat\s+\d{1,3})\b/;

const RENTAL_TERMS = /\b(car\s+rental|rent\s+a\s+car|rental|aluguel\s+de\s+carro|aluguer\s+de\s+veiculo|locacao\s+de\s+veiculo|alugar\s+carro|autonoleggio)\b/;
const PICKUP = /\b(pick[\s-]?up|retirada|coleta|recolha)\b/;
const DROPOFF = /\b(drop[\s-]?off|devolucao|entrega)\b/;
const VEHICLE_CLASS = /\b(compact|economy|intermediate|full[\s-]?size|midsize|standard|premium|suv|sedan|minivan|van|hatchback|grupo\s+[a-z]|categoria\s+[a-z]|car\s+class|vehicle\s+class)\b/;
const MILEAGE_TERMS = /\b(unlimited\s+mileage|quilometragem\s+livre|rental\s+agreement|driver|condutor|franquia)\b/;
const RENTAL_VENDOR = /\b(hertz|avis|budget|enterprise|sixt|europcar|alamo|national|thrifty|dollar|localiza|movida|unidas|goldcar|centauro)\b/;

const TICKET_TERMS = /\b(ticket|tickets|ingresso|ingressos|admission|entrada|tour|tours|passeio|passeios|excursao|excursao|experience|experiencia|guided|guiad[ao]|visita|museum|museu)\b/;
const EVENT_TERMS = /\b(event|events|show|concert|concerto|espetaculo|exhibition|exposicao|performance|session|sessao|festival|jogo|game)\b/;
const TICKET_VENDOR = /\b(ticketmaster|eventbrite|getyourguide|viator|airbnb\s+experiences|sympla|stubhub|viagogo|musement|klook|seatgeek)\b/;
const PARTY_SIZE = /\b(\d{1,2})\s*(adults?|adultos?|children|child|criancas?|crianca|tickets?|ingressos?|pax|pessoas|people|persons?)\b/;
const VENUE_TERMS = /\b(venue|local\s+do\s+evento|theatre|theater|teatro|arena|stadium|estadio|auditorium)\b/;

// Negative signals: promotional, security and unrelated-retail mail must never
// become an item, no matter how many travel words it borrows.
const DENY_PROMO = /\b(unsubscribe|descadastrar|cancelar\s+inscricao|newsletter|webinar|black\s+friday|cyber\s+monday|promo\s+code|codigo\s+promocional)\b|\b\d{1,2}\s*%\s*(off|de\s+desconto)\b/;
const DENY_SECURITY = /\b(password\s+reset|reset\s+your\s+password|redefinir\s+(?:a\s+)?senha|redefinicao\s+de\s+senha|verify\s+your\s+(?:email|account)|verifique\s+seu\s+e-?mail|one-?time\s+(?:code|password)|codigo\s+de\s+verificacao|two-?factor|autenticacao\s+de\s+dois\s+fatores|login\s+attempt)\b/;
const DENY_RETAIL = /\b(order\s+shipped|has\s+shipped|out\s+for\s+delivery|tracking\s+number|nota\s+fiscal|pedido\s+enviado|saiu\s+para\s+entrega|delivery\s+confirmation|your\s+order\s+is\s+on\s+its\s+way)\b/;

type Ctx = { subject: string; body: string; all: string; raw: string };

type SignalRule = { code: string; weight: number; when: (ctx: Ctx) => boolean };

const FLIGHT_SIGNALS: SignalRule[] = [
  { code: 'flight_terms', weight: 1.2, when: (c) => FLIGHT_TERMS.test(c.all) },
  { code: 'pnr', weight: 1.5, when: (c) => REFERENCE_LABEL.test(c.all) },
  {
    code: 'flight_number',
    weight: 1.6,
    when: (c) => FLIGHT_NUMBER_LABEL.test(c.all) || (
      // A bare carrier code (BA208) only counts when the mail already reads like
      // a flight, so an unrelated 6-character code is never promoted to a flight.
      (FLIGHT_TERMS.test(c.all) || REFERENCE_LABEL.test(c.all)) && /\b([a-z]{2}\s?\d{1,4})\b/.test(c.subject)
    ),
  },
  { code: 'departure_arrival', weight: 1.2, when: (c) => DEPART_ARRIVE.test(c.all) },
  { code: 'airport_terms', weight: 0.8, when: (c) => AIRPORT_TERMS.test(c.all) },
  { code: 'boarding_pass', weight: 0.6, when: (c) => BOARDING_TERMS.test(c.all) },
];

const HOTEL_SIGNALS: SignalRule[] = [
  { code: 'checkin_checkout', weight: 2.4, when: (c) => CHECKIN.test(c.all) && CHECKOUT.test(c.all) },
  { code: 'nights', weight: 1.0, when: (c) => NIGHTS.test(c.all) },
  { code: 'hotel_terms', weight: 1.4, when: (c) => HOTEL_TERMS.test(c.all) },
  { code: 'address_block', weight: 0.6, when: (c) => ADDRESS_TERMS.test(c.all) },
  { code: 'guest_room', weight: 0.5, when: (c) => GUEST_TERMS.test(c.all) },
  {
    code: 'stay_window',
    weight: 0.4,
    when: (c) => /\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b[\s\S]{0,60}\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/.test(c.all),
  },
];

const TRANSPORT_SIGNALS: SignalRule[] = [
  { code: 'rail_terms', weight: 1.6, when: (c) => RAIL_TERMS.test(c.all) },
  { code: 'bus_terms', weight: 1.2, when: (c) => BUS_TERMS.test(c.all) },
  { code: 'station_terms', weight: 1.0, when: (c) => STATION_TERMS.test(c.all) },
  { code: 'departure_arrival', weight: 1.0, when: (c) => DEPART_ARRIVE.test(c.all) },
  { code: 'booking_code', weight: 1.2, when: (c) => REFERENCE_LABEL.test(c.all) },
  { code: 'seat_carriage', weight: 0.5, when: (c) => SEAT_TERMS.test(c.all) },
];

const CAR_SIGNALS: SignalRule[] = [
  { code: 'rental_terms', weight: 1.8, when: (c) => RENTAL_TERMS.test(c.all) },
  { code: 'pickup_dropoff', weight: 1.8, when: (c) => PICKUP.test(c.all) && DROPOFF.test(c.all) },
  { code: 'vehicle_class', weight: 0.9, when: (c) => VEHICLE_CLASS.test(c.all) },
  { code: 'rental_vendor', weight: 0.9, when: (c) => RENTAL_VENDOR.test(c.all) },
  { code: 'mileage_terms', weight: 0.6, when: (c) => MILEAGE_TERMS.test(c.all) },
];

const ACTIVITY_SIGNALS: SignalRule[] = [
  { code: 'ticket_terms', weight: 1.4, when: (c) => TICKET_TERMS.test(c.all) },
  { code: 'ticket_vendor', weight: 1.2, when: (c) => TICKET_VENDOR.test(c.all) },
  { code: 'event_datetime', weight: 1.0, when: (c) => EVENT_TERMS.test(c.all) },
  { code: 'booking_code', weight: 1.0, when: (c) => REFERENCE_LABEL.test(c.all) },
  { code: 'party_size', weight: 0.6, when: (c) => PARTY_SIZE.test(c.all) },
  { code: 'venue_terms', weight: 0.6, when: (c) => VENUE_TERMS.test(c.all) },
];

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------
const KNOWN_VENDORS = [
  'booking.com', 'airbnb', 'expedia', 'hotels.com', 'agoda', 'trivago',
  'hertz', 'avis', 'budget', 'enterprise', 'sixt', 'europcar', 'alamo', 'localiza', 'movida', 'unidas',
  'ticketmaster', 'eventbrite', 'getyourguide', 'viator', 'sympla', 'klook',
  'flixbus', 'amtrak', 'renfe', 'trenitalia', 'eurostar', 'thalys', 'italo',
];

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  'R$': 'BRL', US$: 'USD', $: 'USD', '€': 'EUR', '£': 'GBP',
};

function cleanInline(value: string) {
  return value.replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim().slice(0, 80);
}

// Place values frequently arrive wrapped in boilerplate ("10:00 at Faro
// Airport", "at 3pm - Faro Airport"). Keep the place, drop the clock.
function tidyPlace(value: string) {
  let text = cleanInline(value);
  const parts = text.split(/\s+(?:at|em|@|às)\s+/i);
  if (parts.length > 1) text = parts[parts.length - 1];
  text = text.replace(/^[\d/:.\s-]+/, '').replace(/^(?:the|o|a)\s+/i, '');
  return cleanInline(text);
}

function labelledValue(raw: string, labels: string[]) {
  const pattern = new RegExp(
    `(?:^|[\\n;,|])\\s*(?:${labels.join('|')})\\s*[:\\-–]\\s*([^\\n;|]{2,60})`,
    'i',
  );
  const m = raw.match(pattern);
  return m ? cleanInline(m[1]) : '';
}

const AIRLINE_TERMS = [
  'british airways', 'latam', 'tap air portugal', 'tap', 'ryanair', 'easyjet',
  'united airlines', 'delta air lines', 'delta', 'american airlines', 'lufthansa',
  'air france', 'iberia', 'klm', 'emirates', 'qatar airways', 'azul', 'gol linhas aereas',
  'gol', 'swiss', 'ita airways', 'alitalia', 'vueling', 'aer lingus', 'qantas',
  'singapore airlines', 'turkish airlines', 'air canada',
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word match only: "localizador" must not read as the Localiza brand.
function matchWholeWord(folded: string, term: string) {
  return new RegExp(`\\b${escapeRegex(term)}\\b`).test(folded);
}

function extractVendor(raw: string) {
  const folded = foldText(raw);
  const hit = KNOWN_VENDORS.find((vendor) => matchWholeWord(folded, vendor));
  if (!hit) return '';
  return hit.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function extractAirline(raw: string) {
  const labelled = labelledValue(raw, ['airline', 'companhia(?:\\s+a[eé]rea)?', 'carrier', 'operated\\s+by']);
  if (labelled) return labelled;
  const folded = foldText(raw);
  const hit = AIRLINE_TERMS.find((airline) => matchWholeWord(folded, airline));
  return hit ? hit.replace(/\b\w/g, (ch) => ch.toUpperCase()) : '';
}

const REFERENCE_NOISE = new Set([
  'CODE', 'NUMBER', 'CONFIRMATION', 'RESERVA', 'BOOKING', 'LOCATOR', 'CODES',
  'NUMBER:', 'REFERENCE', 'RESERVATION', 'CONFIRMED',
]);

// A booking code must read like a code: 4-14 chars, at least one digit, and not
// the label word itself ("Confirmation code: HSC-88421" → HSC-88421, not CODE).
function extractReference(raw: string) {
  const pattern = /\b(?:record\s+locator|booking\s+reference|reservation\s+(?:code|number)|confirmation\s+(?:code|number)|confirmation|order\s+(?:code|number|id)|pnr|localizador|c[oó]digo\s+de\s+reserva|c[oó]digo\s+do\s+pedido|refer[eê]ncia\s+da\s+reserva)\b[^A-Za-z0-9]{0,16}([A-Z0-9][A-Z0-9-]{3,14})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(raw))) {
    const candidate = m[1].toUpperCase().replace(/-+$/, '');
    if (REFERENCE_NOISE.has(candidate)) continue;
    if (!/\d/.test(candidate)) continue;
    return candidate;
  }
  return '';
}

// Handles both "1,240.00" (EN) and "3.480,90" (PT) without guessing wrong.
function parseMoney(value: string) {
  const text = value.trim();
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  const normalized = lastComma > lastDot
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/,/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function extractAmount(raw: string): { amount: number | null; currency: string } {
  const symbolMatch = raw.match(/(R\$|US\$|\$|€|£)\s?(\d[\d.,]*)/);
  if (symbolMatch) {
    return { amount: parseMoney(symbolMatch[2]), currency: CURRENCY_BY_SYMBOL[symbolMatch[1]] || '' };
  }
  const codeMatch = raw.match(/\b(BRL|USD|EUR|GBP)\s?(\d[\d.,]*)/i);
  if (codeMatch) {
    return { amount: parseMoney(codeMatch[2]), currency: codeMatch[1].toUpperCase() };
  }
  return { amount: null, currency: '' };
}

function extractFlightNumber(raw: string, subjectRaw: string) {
  const labelled = raw.match(
    /\b(?:flight|voo|flt|vuelo)\b[^A-Za-z0-9]{0,12}([A-Za-z0-9]{2})\s?(\d{1,4})\b/i,
  );
  if (labelled) return `${labelled[1].toUpperCase()}${labelled[2]}`;
  const bare = subjectRaw.match(/\b([A-Z]{2}\s?\d{1,4})\b/);
  if (bare) return bare[1].replace(/\s+/g, '').toUpperCase();
  return '';
}

function extractAirportPair(raw: string) {
  // LHR → NAP / LHR - NAP
  const arrowCodes = raw.match(/\b([A-Z]{3})\s*(?:→|->|-|–|to|para)\s*([A-Z]{3})\b/);
  if (arrowCodes) return { from: arrowCodes[1], to: arrowCodes[2] };

  // "London Heathrow (LHR) to Naples (NAP)" — the first two IATA codes in the
  // text are the origin and destination in every carrier template we handle.
  const bracketed = [...raw.matchAll(/\(([A-Z]{3})\)/g)].map((m) => m[1]);
  if (bracketed.length >= 2 && bracketed[0] !== bracketed[1]) {
    return { from: bracketed[0], to: bracketed[1] };
  }

  const labelledFrom = labelledValue(raw, ['from', 'de', 'origin', 'origem', 'saindo de', 'partida de']);
  const labelledTo = labelledValue(raw, ['to', 'para', 'destination', 'destino', 'chegando em']);
  if (labelledFrom || labelledTo) return { from: labelledFrom, to: labelledTo };

  // Inline "from Lisbon to Porto".
  const inline = raw.match(/\bfrom\s+([A-Z][^\n,;]{2,30}?)\s+to\s+([A-Z][^\n,;]{2,30}?)(?:[.\n,;]|$)/);
  if (inline) return { from: cleanInline(inline[1]), to: cleanInline(inline[2]) };

  return { from: '', to: '' };
}

// "Bilhete comboio Lisboa → Porto confirmado" → Lisboa / Porto: only the
// capitalised words hugging the arrow are place names, never the sentence
// around them.
function extractPlacePair(raw: string) {
  const arrow = raw.match(/→|->|–/);
  if (arrow && typeof arrow.index === 'number') {
    const left = raw.slice(Math.max(0, arrow.index - 60), arrow.index);
    const right = raw.slice(arrow.index + arrow[0].length, arrow.index + arrow[0].length + 60);
    const trailing = (left.replace(/\([^)]*\)/g, ' ').match(/[\p{L}'’.-]+/gu) || []);
    const leading = (right.replace(/\([^)]*\)/g, ' ').match(/[\p{L}'’.-]+/gu) || []);
    const isCapitalised = (word: string) => /^\p{Lu}/u.test(word);
    const fromWords: string[] = [];
    for (let i = trailing.length - 1; i >= 0 && isCapitalised(trailing[i]); i -= 1) fromWords.unshift(trailing[i]);
    const toWords: string[] = [];
    for (let i = 0; i < leading.length && isCapitalised(leading[i]); i += 1) toWords.push(leading[i]);
    if (fromWords.length || toWords.length) {
      return { from: cleanInline(fromWords.join(' ')), to: cleanInline(toWords.join(' ')) };
    }
  }
  return extractAirportPair(raw);
}

function extractHotelName(raw: string) {
  const labelled = labelledValue(raw, ['property', 'accommodation', 'hospedagem', 'name of the hotel']);
  if (labelled) return labelled;
  // "Hotel Santa Caterina, Amalfi" → Hotel Santa Caterina (keyword kept, address dropped).
  const named = raw.match(/\b(Hotel|Pousada|Hostel|Resort|Hospedagem|Accommodation|Apartment|Apartamento|Suite|Villa|Chalet|Airbnb)\b\s+([^\n,;|(\[]{2,50})/i);
  if (named) return cleanInline(`${named[1]} ${named[2]}`);
  const line = raw.split('\n').find((l) => HOTEL_TERMS.test(foldText(l)) && l.trim().length >= 6 && l.trim().length <= 90);
  return line ? cleanInline(line) : '';
}

function extractVenue(raw: string) {
  return labelledValue(raw, ['venue', 'local do evento', 'local', 'theatre', 'theater', 'teatro', 'arena', 'stadium', 'estádio', 'estadio']);
}

function extractStation(raw: string) {
  const labelled = raw.match(/\b(?:station|esta[cç][aã]o|gare)\s*[:\-–]\s*([^\n;|]{2,60})/i);
  return labelled ? tidyPlace(labelled[1]) : '';
}

function extractPickupLocation(raw: string) {
  const value = labelledValue(raw, ['pick-?up(?:\\s+location)?', 'pickup(?:\\s+location)?', 'retirada', 'coleta', 'recolha']);
  return value ? tidyPlace(value) : '';
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------
function scoreType(ctx: Ctx, rules: SignalRule[]) {
  const matched: string[] = [];
  let score = 0;
  for (const rule of rules) {
    if (!rule.when(ctx)) continue;
    matched.push(rule.code);
    score += rule.weight;
  }
  return { score, matched };
}

function buildReason(type: ReservationType, signals: string[]) {
  if (type === 'other' || !signals.length) return 'no strong signals';
  return `${type}: ${signals.join(', ')}`;
}

export function classifyReservation(input: { subject?: string; text?: string }): ReservationClassification {
  const subjectRaw = typeof input?.subject === 'string' ? input.subject : '';
  const bodyRaw = typeof input?.text === 'string' ? input.text : '';
  const raw = `${subjectRaw}\n${bodyRaw}`.trim();
  const ctx: Ctx = {
    subject: foldText(subjectRaw),
    body: foldText(bodyRaw),
    all: foldText(raw),
    raw,
  };

  const base: ReservationClassification = {
    type: 'other',
    confidence: 0,
    score: 0,
    signals: [],
    denied: false,
    denyCode: '',
    reason: 'no strong signals',
    draft: normalizeDraft({}, subjectRaw),
    fields: { pnr: '', booking_code: '', vendor: '', amount: null, currency: '', nights: null, from: '', to: '', venue: '' },
  };
  if (!raw) return base;

  const scored = {
    flight: scoreType(ctx, FLIGHT_SIGNALS),
    hotel: scoreType(ctx, HOTEL_SIGNALS),
    train: scoreType(ctx, TRANSPORT_SIGNALS),
    car: scoreType(ctx, CAR_SIGNALS),
    activity: scoreType(ctx, ACTIVITY_SIGNALS),
  };

  // Deny list first: promotional / security mail is discarded even when it
  // contains travel vocabulary. Unrelated retail needs no travel evidence.
  let denyCode = '';
  if (DENY_PROMO.test(ctx.all)) denyCode = 'denied_promotional';
  else if (DENY_SECURITY.test(ctx.all)) denyCode = 'denied_account_security';
  else if (DENY_RETAIL.test(ctx.all)) {
    const bestTravel = Math.max(...Object.values(scored).map((s) => s.score));
    if (bestTravel < RESERVATION_CONFIDENCE_POLICY.MIN_TYPE_SCORE) denyCode = 'denied_non_travel_receipt';
  }
  if (denyCode) {
    return { ...base, denied: true, denyCode, reason: denyCode };
  }

  const ranked = (Object.keys(scored) as Array<keyof typeof scored>)
    .map((type) => ({ type, ...scored[type] }))
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const runnerUp = ranked[1];

  let score = winner.score;
  // Two plausible types means the message is ambiguous, so trust it less.
  if (runnerUp && runnerUp.score >= score * RESERVATION_CONFIDENCE_POLICY.COMPETITOR_SHARE) {
    score -= (score - runnerUp.score) * 0.5;
  }

  let type: ReservationType = winner.score >= RESERVATION_CONFIDENCE_POLICY.MIN_TYPE_SCORE
    ? (winner.type as ReservationType)
    : 'other';
  if (type === 'other') score = Math.min(score, RESERVATION_CONFIDENCE_POLICY.MIN_TYPE_SCORE - 0.1);

  const datetimes = findDateTimes(ctx.all);
  const firstDate = datetimes[0]?.value || '';

  const fields: ReservationFields = {
    pnr: extractReference(raw),
    booking_code: extractReference(raw),
    vendor: extractVendor(raw),
    amount: null,
    currency: '',
    nights: null,
    from: '',
    to: '',
    venue: '',
  };
  const money = extractAmount(raw);
  fields.amount = money.amount;
  fields.currency = money.currency;
  const nightsMatch = ctx.all.match(NIGHTS);
  if (nightsMatch) fields.nights = Number(nightsMatch[1]);

  const subjectFallback = subjectRaw.trim() || 'Imported reservation';
  let draftRaw: any = { type, title: subjectFallback };

  if (type === 'flight') {
    const pair = extractAirportPair(raw);
    const departure = pickDateNear(datetimes, labelIndex(ctx.all, DEPART_ARRIVE));
    const arrivalLabel = labelIndex(ctx.all, /\b(arrival|arrives|chegada|chega|desembarque)\b/);
    const arrival = arrivalLabel >= 0 ? pickDateNear(datetimes, arrivalLabel) : (datetimes[1]?.value || '');
    const flightNumber = extractFlightNumber(raw, subjectRaw);
    const airline = extractAirline(raw);
    fields.from = pair.from;
    fields.to = pair.to;
    draftRaw = {
      type,
      title: [airline, flightNumber, pair.from && pair.to ? `${pair.from} → ${pair.to}` : (pair.from || pair.to)]
        .filter(Boolean).join(' ') || subjectFallback,
      start_datetime: departure || firstDate,
      end_datetime: arrival,
      location_from: pair.from,
      location_to: pair.to,
      confirmation_number: flightNumber,
      booking_reference: fields.pnr,
      airline,
    };
  } else if (type === 'hotel') {
    const hotelName = extractHotelName(raw);
    const checkin = pickDateNear(datetimes, labelIndex(ctx.all, CHECKIN));
    const checkout = pickDateNear(datetimes, labelIndex(ctx.all, CHECKOUT));
    fields.venue = hotelName;
    draftRaw = {
      type,
      title: hotelName || subjectFallback,
      start_datetime: checkin || firstDate,
      end_datetime: checkout && checkout !== checkin ? checkout : (datetimes[1]?.value || ''),
      location_name: hotelName,
      confirmation_number: fields.pnr,
      booking_reference: fields.pnr,
    };
  } else if (type === 'train') {
    const pair = extractPlacePair(raw);
    const stationFrom = extractStation(raw);
    const departure = pickDateNear(datetimes, labelIndex(ctx.all, DEPART_ARRIVE));
    fields.from = pair.from || stationFrom;
    fields.to = pair.to;
    draftRaw = {
      type,
      title: pair.from && pair.to ? `${pair.from} → ${pair.to}` : subjectFallback,
      start_datetime: departure || firstDate,
      end_datetime: datetimes[1]?.value || '',
      location_from: fields.from,
      location_to: fields.to,
      confirmation_number: fields.pnr,
      booking_reference: fields.pnr,
    };
  } else if (type === 'car') {
    const pickupLocation = extractPickupLocation(raw);
    const pickup = pickDateNear(datetimes, labelIndex(ctx.all, PICKUP));
    const dropoff = pickDateNear(datetimes, labelIndex(ctx.all, DROPOFF));
    fields.venue = pickupLocation;
    draftRaw = {
      type,
      title: fields.vendor ? `${fields.vendor} car rental` : subjectFallback,
      start_datetime: pickup || firstDate,
      end_datetime: dropoff && dropoff !== pickup ? dropoff : (datetimes[1]?.value || ''),
      location_name: pickupLocation,
      confirmation_number: fields.pnr,
      booking_reference: fields.pnr,
    };
  } else if (type === 'activity') {
    const venue = extractVenue(raw);
    fields.venue = venue;
    draftRaw = {
      type,
      title: subjectFallback || venue,
      start_datetime: firstDate,
      end_datetime: '',
      location_name: venue,
      confirmation_number: fields.pnr,
      booking_reference: fields.pnr,
    };
  }

  // The draft keeps the claimed type even when no date was found; a missing
  // date only caps confidence (below), it never rewrites the type.
  const draft = normalizeDraft(draftRaw, subjectFallback);

  let confidence = clamp01(score / RESERVATION_CONFIDENCE_POLICY.SATURATION_SCORE);
  if (!draft.start_datetime) confidence = Math.min(confidence, RESERVATION_CONFIDENCE_POLICY.NO_DATE_CONFIDENCE_CAP);
  if (type === 'other') confidence = Math.min(confidence, RESERVATION_CONFIDENCE_POLICY.PENDING_MIN - 0.01);

  const signals = winner.matched.slice(0, 6);

  return {
    type,
    confidence,
    score: Math.round(score * 100) / 100,
    signals,
    denied: false,
    denyCode: '',
    reason: buildReason(type, signals),
    draft,
    fields,
  };
}

// Maps a classification onto the automation policy. Kept separate so callers
// (and tests) can reason about the decision without re-deriving thresholds.
export function decideReservationPolicy(classification: ReservationClassification): {
  outcome: PolicyOutcome;
  reasonCode: string;
} {
  if (classification.denied) {
    return { outcome: 'ignore', reasonCode: classification.denyCode || 'denied' };
  }
  if (classification.confidence >= RESERVATION_CONFIDENCE_POLICY.AUTO_CREATE_MIN) {
    return { outcome: 'auto_create', reasonCode: 'high_confidence' };
  }
  if (classification.confidence >= RESERVATION_CONFIDENCE_POLICY.PENDING_MIN) {
    return { outcome: 'pending', reasonCode: 'medium_confidence' };
  }
  return { outcome: 'ignore', reasonCode: 'low_confidence' };
}