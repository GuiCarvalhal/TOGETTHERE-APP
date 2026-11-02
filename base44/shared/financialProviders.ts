// Provider adapters for the financial integration.
//
// One function per provider returns RAW bank rows (signed amounts, provider ids,
// provider categories, provider dates). The sync function normalizes them with
// financialTransactions.ts, so adding Plaid/Tink/Belvo later means adding ONE
// case here — nothing else in the pipeline changes.
//
// Credentials: no adapter stores a token. A real provider receives its access
// token from the app's encrypted credential path (the same AES-GCM secret store
// the inbox connectors use) keyed by the connection, and only an opaque
// provider_item_ref is kept on the record.

export class ProviderError extends Error {
  reason: string;
  constructor(reason: string, message = reason) {
    super(message);
    this.name = 'ProviderError';
    this.reason = reason;
  }
}

export type RawTransaction = {
  external_id: string;
  date: string;
  description: string;
  merchant?: string;
  raw_category?: string;
  currency?: string;
  amount: number | string;
  status?: 'pending' | 'posted';
};

function isoDay(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Deterministic stub feed so the whole pipeline (normalize -> dedupe -> suggest
// -> review -> expense) can be exercised before a real provider exists. Ids are
// stable, so syncing twice imports nothing the second time.
function demoFeed(connection: any): RawTransaction[] {
  const currency = connection?.currency || 'USD';
  return [
    { external_id: 'demo-tx-0001', date: isoDay(-1), description: 'UBER   *TRIP', merchant: 'Uber', raw_category: 'TRANSPORTATION', currency, amount: '-24.80', status: 'posted' },
    { external_id: 'demo-tx-0002', date: isoDay(-1), description: 'TRATTORIA DA ENZO', merchant: 'Trattoria da Enzo', raw_category: 'FOOD_AND_DRINK', currency, amount: '-86.40', status: 'posted' },
    { external_id: 'demo-tx-0003', date: isoDay(-2), description: 'BOOKING.COM', merchant: 'Booking.com', raw_category: 'TRAVEL', currency, amount: '-412.00', status: 'pending' },
    { external_id: 'demo-tx-0004', date: isoDay(-3), description: 'LATAM AIRLINES', merchant: 'LATAM Airlines', raw_category: 'TRAVEL', currency, amount: '-638.20', status: 'posted' },
    { external_id: 'demo-tx-0005', date: isoDay(-4), description: 'METRO CARD REFILL', merchant: 'Metro Card Refill', raw_category: 'TRANSPORTATION', currency, amount: '-20.00', status: 'posted' },
    { external_id: 'demo-tx-0006', date: isoDay(-5), description: 'UBER   *REFUND', merchant: 'Uber', raw_category: 'TRANSPORTATION', currency, amount: '8.50', status: 'posted' },
  ];
}

// Returns the provider's raw transactions for one connection.
export async function fetchProviderTransactions(connection: any): Promise<RawTransaction[]> {
  switch (String(connection?.provider || '').toLowerCase()) {
    case 'demo':
      return demoFeed(connection);
    default:
      // A real provider plugs in here once its credentials are configured.
      throw new ProviderError('provider_not_configured', 'This provider is not configured yet');
  }
}