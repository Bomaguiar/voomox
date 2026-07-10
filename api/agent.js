// /api/agent — Vercel serverless proxy to the Voomox Base44 Superagent.
// The API key lives in Vercel env vars, never in the browser.
//
// Required environment variables (Vercel dashboard → Settings → Environment Variables):
//   BASE44_API_KEY    your Base44 api_key
//   BASE44_AGENT_ID   defaults to the Voomox superagent if unset

const BASE = 'https://app.base44.com/api/agents';
const AGENT_ID = process.env.BASE44_AGENT_ID || '6a402021108151927275d8e6';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.BASE44_API_KEY;
  if (!key) return res.status(500).json({ error: 'BASE44_API_KEY not configured' });

  try {
    const { message, conversation_id } = req.body || {};
    if (!message || typeof message !== 'string' || message.length > 4000)
      return res.status(400).json({ error: 'invalid message' });

    const H = { api_key: key, 'Content-Type': 'application/json' };
    let convId = conversation_id;

    // 1. create conversation if this is the first message
    if (!convId) {
      const r = await fetch(`${BASE}/${AGENT_ID}/conversations`, { method: 'POST', headers: H, body: '{}' });
      if (!r.ok) throw new Error(`conversation create ${r.status}`);
      convId = (await r.json()).id;
    }

    // 2. send the user message
    const send = await fetch(`${BASE}/${AGENT_ID}/conversations/${convId}/messages`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ role: 'user', content: message, file_urls: [] })
    });
    if (!send.ok) throw new Error(`message send ${send.status}`);
    let reply = lastAssistant((await send.json()).messages);

    // 3. poll if the agent answers asynchronously (max ~24s; Vercel hobby limit is 60s)
    for (let i = 0; i < 8 && !reply; i++) {
      await new Promise(s => setTimeout(s, 3000));
      const g = await fetch(`${BASE}/${AGENT_ID}/conversations/${convId}`, { headers: H });
      if (g.ok) reply = lastAssistant((await g.json()).messages);
    }

    return res.status(200).json({
      reply: reply || 'The agent is taking longer than usual — try again in a moment.',
      conversation_id: convId
    });
  } catch (e) {
    console.error('agent proxy error:', e.message);
    return res.status(502).json({ error: 'agent unavailable' });
  }
};

function lastAssistant(msgs) {
  if (!Array.isArray(msgs)) return null;
  const a = msgs.filter(m => m.role === 'assistant' && m.content);
  return a.length ? a[a.length - 1].content : null;
}
