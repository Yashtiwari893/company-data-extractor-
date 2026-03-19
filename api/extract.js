import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, model, response_format } = req.body;
  const GROQ_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_KEY) return res.status(500).json({ error: 'Groq API Key missing on Vercel' });

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: model || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.1,
      response_format
    }, {
      headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }
    });
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Extract Vercel Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Extraction failed' });
  }
}
