// Airline → own-lounge brand. Static, deterministic context used by Home's
// Next/Now brief to name the lounge a traveller can actually walk into with
// their ticket, paired with the live terminal from the flight feed. Kept here
// (not in the client) so both the brief and any future server-side tip share
// one list; nothing here depends on a network call.

const LOUNGES: { match: string[]; name: string }[] = [
  { match: ['american'], name: 'Admirals Club' },
  { match: ['delta'], name: 'Delta Sky Club' },
  { match: ['united'], name: 'United Club' },
  { match: ['alaska'], name: 'Alaska Lounge' },
  { match: ['jetblue', 'jet blue'], name: 'JetBlue Even More Space lounge' },
  { match: ['southwest'], name: '' },
  { match: ['british airways'], name: 'Galleries Club' },
  { match: ['virgin atlantic'], name: 'Clubhouse' },
  { match: ['air france'], name: 'Salon Lounge' },
  { match: ['klm'], name: 'KLM Crown Lounge' },
  { match: ['lufthansa'], name: 'Senator Lounge' },
  { match: ['iberia'], name: 'Sala VIP' },
  { match: ['ita ', 'alitalia'], name: 'Casa ITA Lounge' },
  { match: ['tap '], name: 'TAP Premium Lounge' },
  { match: ['emirates'], name: 'Emirates Lounge' },
  { match: ['qatar'], name: 'Al Mourjan Lounge' },
  { match: ['turkish'], name: 'Miles&Smiles Lounge' },
  { match: ['singapore airlines'], name: 'SilverKris Lounge' },
  { match: ['cathay'], name: 'The Pier' },
  { match: ['ana ', 'all nippon'], name: 'ANA Lounge' },
  { match: ['jal ', 'japan airlines'], name: 'Sakura Lounge' },
  { match: ['qantas'], name: 'Qantas Club' },
  { match: ['air canada'], name: 'Maple Leaf Lounge' },
  { match: ['latam'], name: 'LATAM Lounge' },
  { match: ['gol '], name: 'GOL Premium Lounge' },
  { match: ['azul'], name: 'Azul Lounge' },
  { match: ['aeromexico', 'aeroméxico'], name: 'Salón Premier' },
  { match: ['copa'], name: 'Copa Club' },
  { match: ['avianca'], name: 'Avianca Lounge' },
];

// { name, terminal } when the airline has a known lounge brand, else null.
// `terminal` is passed through from the live departure feed ('' when unknown).
export function loungeForAirline(airline: string, terminal = '') {
  const query = typeof airline === 'string' ? airline.toLowerCase() : '';
  if (!query) return null;
  const hit = LOUNGES.find((entry) => entry.match.some((m) => query.includes(m)));
  if (!hit || !hit.name) return null;
  return { name: hit.name, terminal: typeof terminal === 'string' ? terminal.trim() : '' };
}