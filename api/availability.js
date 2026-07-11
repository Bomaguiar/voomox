// /api/availability — Vercel serverless proxy to Calendly's availability API.
// Lets the on-page chat suggest real open slots for the "one-on-one" event
// instead of just linking to the calendar blind.
//
// Required environment variables (Vercel dashboard → Settings → Environment Variables):
//   CALENDLY_API_KEY      Personal Access Token for the calendly.com/pedrodaguiar account
//   CALENDLY_EVENT_SLUG   defaults to "one-on-one" if unset
//   CALENDLY_TIMEZONE     defaults to "Europe/Lisbon" if unset

const BASE = 'https://api.calendly.com';
const EVENT_SLUG = process.env.CALENDLY_EVENT_SLUG || 'one-on-one';
const TIMEZONE = process.env.CALENDLY_TIMEZONE || 'Europe/Lisbon';
const MAX_SLOTS = 5;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const key = process.env.CALENDLY_API_KEY;
  if (!key) return res.status(500).json({ error: 'CALENDLY_API_KEY not configured' });

  const H = { Authorization: `Bearer ${key}` };

  try {
    const me = await fetch(`${BASE}/users/me`, { headers: H });
    if (!me.ok) throw new Error(`users/me ${me.status}`);
    const user = (await me.json()).resource;

    const typesRes = await fetch(`${BASE}/event_types?user=${encodeURIComponent(user.uri)}&active=true`, { headers: H });
    if (!typesRes.ok) throw new Error(`event_types ${typesRes.status}`);
    const types = (await typesRes.json()).collection;
    const eventType = types.find(t => t.slug === EVENT_SLUG);
    if (!eventType) return res.status(404).json({ error: `no active event type with slug "${EVENT_SLUG}"` });

    // Calendly caps this range at 7 days per request.
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const availRes = await fetch(
      `${BASE}/event_type_available_times?event_type=${encodeURIComponent(eventType.uri)}` +
      `&start_time=${start.toISOString()}&end_time=${end.toISOString()}`,
      { headers: H }
    );
    if (!availRes.ok) throw new Error(`available_times ${availRes.status}`);
    const slots = (await availRes.json()).collection.slice(0, MAX_SLOTS);

    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE, weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    });

    return res.status(200).json({
      schedulingUrl: eventType.scheduling_url,
      slots: slots.map(s => ({ start: s.start_time, label: fmt.format(new Date(s.start_time)) }))
    });
  } catch (e) {
    console.error('availability proxy error:', e.message);
    return res.status(502).json({ error: 'availability unavailable' });
  }
};
