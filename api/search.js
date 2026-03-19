import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.body; // In this version, we'll treat 'q' as the company name if it's broad
  const SERPER_KEY = process.env.SERPER_API_KEY;

  if (!SERPER_KEY) return res.status(500).json({ error: 'Serper.dev Key missing on Vercel' });

  // Iterative Multi-Query Search for Deep Data Intelligence
  const queries = [
    `"${q}" official website contact page email`,
    `"${q}" office address phone mobile number direct contact`,
    `"${q}" socials linkedin facebook instagram founder owner`
  ];

  try {
    let combinedResults = '';
    let knowledgeGraph = null;

    // Run 3 deep searches sequentially (or in parallel) to gather massive context
    const searchPromises = queries.map(query => 
      axios.post('https://google.serper.dev/search', {
        q: query, num: 6, hl: 'en', gl: 'in'
      }, {
        headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' }
      })
    );

    const responses = await Promise.all(searchPromises);

    responses.forEach((response, idx) => {
      const data = response.data;
      combinedResults += `--- Intelligence Node ${idx + 1} (${queries[idx]}) ---\n`;
      
      if (data.knowledgeGraph) {
        knowledgeGraph = data.knowledgeGraph;
        combinedResults += `[KG] ${knowledgeGraph.title} | ${knowledgeGraph.website} | ${knowledgeGraph.phoneNumber}\n`;
      }
      
      if (data.answerBox) {
        combinedResults += `[ANSWER] ${data.answerBox.answer || data.answerBox.snippet}\n`;
      }

      (data.organic || []).forEach(item => {
        combinedResults += `[RESULT] ${item.title}\n${item.snippet}\n\n`;
      });
    });

    res.status(200).json({ 
      context: combinedResults, 
      knowledgeGraph: knowledgeGraph, // Pick the best one found
      status: 'success'
    });
  } catch (error) {
    console.error('Deep Search Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Deep intelligence scan failed' });
  }
}
