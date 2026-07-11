// /api/lead — Vercel serverless function: emails Pedro whenever the chat
// captures a visitor's email or phone, so leads aren't lost when the tab closes.
//
// Required environment variables (Vercel dashboard → Settings → Environment Variables):
//   RESEND_API_KEY    your Resend API key
//   LEAD_TO_EMAIL     defaults to pedro.aguiar@voomox.com if unset
//   LEAD_FROM_EMAIL   sender address; must be on a domain verified in Resend

const RESEND_API = 'https://api.resend.com/emails';
const TO = process.env.LEAD_TO_EMAIL || 'pedro.aguiar@voomox.com';
const FROM = process.env.LEAD_FROM_EMAIL || 'Voomox Chat <leads@voomox.com>';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  try {
    const { email, phone, intent, page } = req.body || {};
    const contact = email || phone;
    if (!contact || typeof contact !== 'string' || contact.length > 200)
      return res.status(400).json({ error: 'email or phone required' });

    const lines = [
      email ? `Email: ${esc(email)}` : null,
      phone ? `Phone: ${esc(phone)}` : null,
      intent ? `Was asking about: ${esc(intent)}` : null,
      page ? `Page: ${esc(page)}` : null
    ].filter(Boolean).join('<br>');

    const r = await fetch(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email || undefined,
        subject: 'New lead from voomox.com chat',
        html: lines || 'A visitor left contact info in the chat.'
      })
    });
    if (!r.ok) throw new Error(`resend ${r.status}`);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('lead notify error:', e.message);
    return res.status(502).json({ error: 'lead notify failed' });
  }
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
