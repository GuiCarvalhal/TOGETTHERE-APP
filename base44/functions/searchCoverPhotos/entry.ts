import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Trip cover photo search via Pexels. Uses PEXELS_KEY.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const query = (body.query || '').trim();
    if (!query) return Response.json({ error: 'query required (e.g. a destination)' }, { status: 400 });

    const key = secrets.get('PEXELS_KEY');
    if (!key) return Response.json({ error: 'Pexels key (PEXELS_KEY) not configured' }, { status: 500 });

    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) return Response.json({ error: `Pexels request failed (${res.status})` }, { status: 502 });
    const data = await res.json();

    const photos = (data.photos || []).map((p) => ({
      id: p.id,
      url: p.src.large,
      thumb: p.src.medium,
      alt: p.alt || query,
      photographer: p.photographer || '',
    }));
    return Response.json({ photos });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}