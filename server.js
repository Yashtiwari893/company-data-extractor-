import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 11za Search Proxy (Serper.dev) - DEEP SCAN MULTI-QUERY
app.post('/api/search', async (req, res) => {
  const { q } = req.body;
  const SERPER_KEY = process.env.SERPER_API_KEY;

  if (!SERPER_KEY) return res.status(500).json({ error: 'Serper.dev Key missing on server' });

  // 3 Deep Queries for Intelligence Acquisition
  const queries = [
    `"${q}" official website contact page email`,
    `"${q}" office address phone mobile number direct contact`,
    `"${q}" socials linkedin facebook instagram founder owner`
  ];

  try {
    let combinedResults = '';
    let kg = null;

    // Fire all three searches in parallel to minimize research time
    const searchPromises = queries.map(query => 
      axios.post('https://google.serper.dev/search', {
        q: query, num: 6, hl: 'en', gl: 'in'
      }, {
        headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' }
      })
    );

    const responses = await Promise.all(searchPromises);

    responses.forEach((resp, idx) => {
      const data = resp.data;
      combinedResults += `--- NODE ${idx + 1}: ${queries[idx]} ---\n`;
      if (data.knowledgeGraph) kg = data.knowledgeGraph;
      if (data.answerBox) combinedResults += `[QUICK] ${data.answerBox.answer || data.answerBox.snippet}\n`;
      (data.organic || []).forEach(o => combinedResults += `[DATA] ${o.title}\n${o.snippet}\n\n`);
    });

    res.json({ context: combinedResults, knowledgeGraph: kg });
  } catch (error) {
    console.error('Deep Search Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Deep Search failed' });
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
  console.log(`11za Deep-Search Proxy running on http://localhost:${PORT}`);
});
