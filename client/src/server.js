// server/index.js
const express = require('express');
const fetch = global.fetch || require('node-fetch'); // if Node < 18 install node-fetch
require('dotenv').config();
const app = express();

app.use(express.json({ limit: '25mb' })); // allow inlineData larger bodies

const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";
const API_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

// POST /api/summarize
app.post('/api/summarize', async (req, res) => {
  try {
    const apiKey = process.env.GEN_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server misconfigured: missing GEN_API_KEY' });
    }

    const r = await fetch(`${API_BASE}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const text = await r.text(); // read raw
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = { raw: text };
    }

    if (!r.ok) {
      console.error('Google API error:', r.status, json);
      return res.status(r.status).json({ error: json, status: r.status });
    }

    return res.json(json);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Proxy error', details: err.message });
  }
});

const port = process.env.PORT || 5200;
app.listen(port, () => console.log(`Proxy listening on http://localhost:${port}`));
