import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.body;
  const SERPER_KEY = process.env.SERPER_API_KEY;

  if (!SERPER_KEY) return res.status(500).json({ error: 'Serper.dev Key missing on Vercel' });

  try {
    const response = await axios.post('https://google.serper.dev/search', {
      q, num: 5, hl: 'en', gl: 'in'
    }, {
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' }
    });
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Search Vercel Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Search failed' });
  }
}
