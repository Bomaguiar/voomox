// Structured Flight Check lead endpoint for Vercel.
// Required: RESEND_API_KEY. Optional: LEAD_TO_EMAIL, LEAD_FROM_EMAIL.

const RESEND_API = 'https://api.resend.com/emails';
const TO = process.env.LEAD_TO_EMAIL || 'pedro.aguiar@voomox.com';
const FROM = process.env.LEAD_FROM_EMAIL || 'Voomox Flight Check <leads@voomox.com>';

const REQUIRED = [
  'firstName','lastName','email','company','website','role','employees','country',
  'workflow','weeklyTime','outcome','sensitiveData','language','timing'
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ error: 'Lead delivery is not configured' });

  try {
    const b = req.body || {};
    if (b.fax) return res.status(200).json({ ok: true, lead_id: 'accepted' });
    if (b.consent !== true) return res.status(400).json({ error: 'Consent is required' });

    for (const field of REQUIRED) {
      if (typeof b[field] !== 'string' || !b[field].trim())
        return res.status(400).json({ error: `Missing ${field}` });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) || b.email.length > 200)
      return res.status(400).json({ error: 'Invalid email' });
    if (b.workflow.length < 30 || b.workflow.length > 1800)
      return res.status(400).json({ error: 'Workflow description must be 30–1800 characters' });
    if (!validUrl(b.website)) return res.status(400).json({ error: 'Invalid company website' });

    const leadId = `fc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    const rows = [
      ['Lead ID', leadId],['Name', `${b.firstName} ${b.lastName}`],['Email', b.email],
      ['Company', b.company],['Website', b.website],['Role', b.role],['Employees', b.employees],
      ['Country', b.country],['Workflow', b.workflow],['Weekly time', b.weeklyTime],
      ['Main outcome', b.outcome],['Sensitive data', b.sensitiveData],['Language', b.language],
      ['Timing', b.timing],['Notes', b.notes || '—'],['Page', b.page || '—'],
      ['UTM', JSON.stringify(b.utm || {})],['Consent', `yes — ${new Date().toISOString()}`]
    ];
    const html = `<h2>New Voomox Flight Check request</h2><table>${rows.map(([k,v]) =>
      `<tr><th align="left" valign="top" style="padding:6px 14px 6px 0">${esc(k)}</th><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`
    ).join('')}</table><p>Review and respond within two business days. Do not forward outside Voomox.</p>`;

    const r = await fetch(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [TO], reply_to: b.email,
        subject: `Flight Check request — ${cleanSubject(b.company)}`,
        html
      })
    });
    if (!r.ok) throw new Error(`resend ${r.status}`);

    return res.status(200).json({ ok: true, lead_id: leadId });
  } catch (e) {
    console.error('flight check lead error:', e.message);
    return res.status(502).json({ error: 'Lead delivery failed' });
  }
};

function validUrl(value) {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function cleanSubject(value) {
  return String(value).replace(/[\r\n]/g, ' ').slice(0, 120);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

