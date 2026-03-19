import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 11za Search Proxy (Serper.dev)
app.post('/api/search', async (req, res) => {
  const { q } = req.body;
  const SERPER_KEY = process.env.SERPER_API_KEY;

  if (!SERPER_KEY) return res.status(500).json({ error: 'Serper.dev Key missing on server' });

  try {
    const response = await axios.post('https://google.serper.dev/search', {
      q, num: 5, hl: 'en', gl: 'in'
    }, {
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Search Proxy Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Search failed' });
  }
});

// 11za Extraction Proxy (Groq)
app.post('/api/extract', async (req, res) => {
  const { messages, model, response_format } = req.body;
  const GROQ_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_KEY) return res.status(500).json({ error: 'Groq API Key missing on server' });

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: model || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.1,
      response_format
    }, {
      headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Extraction Proxy Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Extraction failed' });
  }
});

app.listen(PORT, () => {
  console.log(`11za Proxy Server running on http://localhost:${PORT}`);
});
