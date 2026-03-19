import * as XLSX from 'xlsx';
import './style.css';

let serperKey = localStorage.getItem('serper_api_key') || '';
let groqKey = localStorage.getItem('groq_api_key') || '';
let currentMode = 'single';
let uploadedHeaders = [];
let companyNames = [];
let allResults = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  if (serperKey) {
    const input = document.getElementById('serpKey');
    if (input) input.value = serperKey;
    setStatus('serpCard', 'serpStatus', 'SAVED ✓', 'ok');
  }
  if (groqKey) {
    const input = document.getElementById('groqKey');
    if (input) input.value = groqKey;
    setStatus('groqCard', 'groqStatus', 'SAVED ✓', 'ok');
  }

  const companyInput = document.getElementById('companyInput');
  if (companyInput) {
    companyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchSingle();
    });
  }

  const uploadArea = document.getElementById('uploadArea');
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    });
  }

  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) processFile(e.target.files[0]);
    });
  }
});

window.saveSerp = function() {
  const k = document.getElementById('serpKey').value.trim();
  if (!k || k.length < 8) { alert('Valid Serper.dev key daalo'); return; }
  serperKey = k;
  localStorage.setItem('serper_api_key', k);
  setStatus('serpCard', 'serpStatus', 'SAVED ✓', 'ok');
}

window.saveGroq = function() {
  const k = document.getElementById('groqKey').value.trim();
  if (!k || !k.startsWith('gsk_')) { alert('Valid Groq key daalo (gsk_...)'); return; }
  groqKey = k;
  localStorage.setItem('groq_api_key', k);
  setStatus('groqCard', 'groqStatus', 'SAVED ✓', 'ok');
}

function setStatus(cardId, statusId, text, cls) {
  const card = document.getElementById(cardId);
  const status = document.getElementById(statusId);
  if (!card || !status) return;
  card.className = 'api-card ' + (cls === 'ok' ? 'connected' : cls === 'fail' ? 'error-state' : '');
  status.className = 'api-status ' + cls;
  status.textContent = text;
}

window.toggleVis = function(id) { 
  const i = document.getElementById(id); 
  i.type = i.type === 'password' ? 'text' : 'password'; 
}

function getSerperKey() { return serperKey || document.getElementById('serpKey').value.trim(); }
function getGroqKey() { return groqKey || document.getElementById('groqKey').value.trim(); }

window.switchTab = function(t) {
  currentMode = t;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('btn-' + t).classList.add('active');
  document.getElementById('panel-' + t).classList.add('active');
  hideResults();
}

window.searchSingle = async function() {
  const name = document.getElementById('companyInput').value.trim();
  if (!name) return showErr('singleError', 'Company ka naam daalo!');

  const sk = getSerperKey(), gk = getGroqKey();
  if (!sk) return showErr('singleError', 'Serper.dev API key save karo!');
  if (!gk) return showErr('singleError', 'Groq key save karo!');

  hideErr('singleError');
  const searchBtn = document.getElementById('searchBtn');
  searchBtn.disabled = true;
  showLoad(name);
  hideResults();

  try {
    const result = await researchCompany(name, null, sk, gk);
    allResults = [result];
    renderCards([result]);
  } catch(e) {
    console.error(e);
    showErr('singleError', e.message);
  } finally {
    searchBtn.disabled = false;
    hideLoad();
  }
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: file.name.endsWith('.csv') ? 'binary' : 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      if (!rows || rows.length < 2) { showErr('excelError', 'Data nahi mila file mein'); return; }

      uploadedHeaders = rows[0].map(h => String(h).trim()).filter(Boolean);
      companyNames = rows.slice(1).map(r => String(r[0] || '').trim()).filter(Boolean);

      document.getElementById('fileName').textContent = file.name;
      document.getElementById('fileStats').textContent = `${companyNames.length} records · ${uploadedHeaders.length} columns`;
      document.getElementById('fileInfo').classList.add('show');

      document.getElementById('hdrPreview').style.display = 'block';
      document.getElementById('hdrTags').innerHTML = uploadedHeaders.map(h => `<span class="htag">${h}</span>`).join('');

      document.getElementById('coPreview').style.display = 'block';
      const prev = companyNames.slice(0, 5);
      document.getElementById('coList').innerHTML =
        prev.map((n, i) => `<div class="crow"><span class="rn">${i+2}</span>${n}</div>`).join('') +
        (companyNames.length > 5 ? `<div style="color:var(--muted);font-size:11px;padding:5px 0;text-align:center">...+aur ${companyNames.length - 5} companies</div>` : '');

      document.getElementById('bulkBtn').disabled = false;
      hideErr('excelError');
    } catch(err) { showErr('excelError', 'File error: ' + err.message); }
  };
  file.name.endsWith('.csv') ? reader.readAsBinaryString(file) : reader.readAsArrayBuffer(file);
}

window.clearFile = function() {
  uploadedHeaders = []; companyNames = [];
  document.getElementById('fileInfo').classList.remove('show');
  document.getElementById('hdrPreview').style.display = 'none';
  document.getElementById('coPreview').style.display = 'none';
  document.getElementById('bulkBtn').disabled = true;
  document.getElementById('fileInput').value = '';
  hideErr('excelError');
}

window.doBulk = async function() {
  if (!companyNames.length) return;
  const sk = getSerperKey(), gk = getGroqKey();
  if (!sk) return showErr('excelError', 'Serper.dev API key save karo!');
  if (!gk) return showErr('excelError', 'Groq key save karo!');

  document.getElementById('bulkBtn').disabled = true;
  allResults = []; hideResults(); hideErr('excelError');

  const pb = document.getElementById('pbar'), pf = document.getElementById('pfill');
  pb.style.display = 'block';

  for (let i = 0; i < companyNames.length; i++) {
    const name = companyNames[i];
    showLoad(name, i, companyNames.length);
    pf.style.width = ((i / companyNames.length) * 100) + '%';

    try {
      allResults.push(await researchCompany(name, uploadedHeaders, sk, gk));
    } catch(e) {
      console.error(e);
      allResults.push({ 'Company Name': name, 'Error': e.message });
    }

    if (i < companyNames.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  pf.style.width = '100%';
  hideLoad();
  pb.style.display = 'none';
  document.getElementById('bulkBtn').disabled = false;
  renderCards(allResults);
}

async function researchCompany(company, headers, sk, gk) {
  setLoadStep(1);
  const searchData = await serperSearch(company, sk);

  setLoadStep(2);
  const result = await groqExtract(company, searchData, headers, gk);
  return result;
}

async function serperSearch(company, apiKey) {
  let combined = '';

  const queries = [
    `"${company}" official website email phone contact`,
    `"${company}" linkedin facebook instagram`
  ];

  for (const q of queries) {
    try {
      const resp = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q, num: 5, hl: 'en', gl: 'in' })
      });

      if (!resp.ok) {
        if (resp.status === 401) throw new Error('Serper: Key Invalid');
        if (resp.status === 403) throw new Error('Serper: Limit Hit');
        continue;
      }

      const data = await resp.json();

      // Knowledge Graph
      if (data.knowledgeGraph) {
        const kg = data.knowledgeGraph;
        combined += `[KNOWLEDGE GRAPH]\nName: ${kg.title}\nWebsite: ${kg.website}\nPhone: ${kg.phoneNumber}\nAddress: ${kg.address}\nDescription: ${kg.description}\n`;
        if (kg.attributes) {
            Object.entries(kg.attributes).forEach(([k, v]) => combined += `${k}: ${v}\n`);
        }
        snippets += '\n';
      }

      // Answer Box
      if (data.answerBox) {
        const ab = data.answerBox;
        combined += `[ANSWER BOX] ${ab.title || ''} | ${ab.answer || ab.snippet}\n\n`;
      }

      // Organic
      (data.organic || []).slice(0, 5).forEach(r => {
        combined += `[WEB] ${r.title} | ${r.link}\nText: ${r.snippet}\n\n`;
      });
      
    } catch(e) {
      console.warn("Serper Query Failed", q, e);
      if (e.message.includes('Serper')) throw e;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  return combined || `No live search data found for "${company}".`;
}

async function groqExtract(company, context, headers, apiKey) {
  const defaultFields = [
    'Website URL', 'Official Email', 'Phone Number',
    'LinkedIn URL', 'Facebook URL', 'Instagram URL', 'Twitter/X URL',
    'Company Address', 'Industry / Sector', 'Founded Year',
    'CEO / Founder Name', 'Number of Employees', 'Short Description'
  ];

  const fields = (headers && headers.length > 1) ? headers.slice(1) : defaultFields;

  const prompt = `Extract company details from the search results provided. Use N/A if not found. Return JSON only.

Target Company: "${company}"

SEARCH RESULTS:
${context.slice(0, 4000)}

SCHEMA:
{
  "Company Name": "${company}",
  ${fields.map(f => `"${f}": "value"`).join(',\n  ')}
}`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  });

  if (!resp.ok) throw new Error(`Groq Error ${resp.status}`);

  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(raw);
    parsed['Company Name'] = parsed['Company Name'] || company;
    return parsed;
  } catch (e) {
    return { 'Company Name': company, 'Status': 'Parse Error', 'Raw': raw.slice(0, 200) };
  }
}

function renderCards(results) {
  const c = document.getElementById('cardsDiv');
  c.innerHTML = '';
  document.getElementById('rcount').textContent = results.length;
  document.getElementById('resultsDiv').classList.add('show');

  results.forEach((r, idx) => {
    const name = r['Company Name'] || 'Unknown Enterprise';
    const fields = Object.entries(r).filter(([k]) => k !== 'Company Name');
    const card = document.createElement('div');
    card.className = 'company-card';
    card.style.animationDelay = (idx * 0.08) + 's';
    
    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="cname"><span class="sdot"></span>${name}</div>
          <div class="cname"><small>${fields.length} data points extracted · #${idx+1}</small></div>
        </div>
        <div class="data-source-badge live">🌐 SERPER.DEV LIVE SEARCH</div>
      </div>
      <div class="fgrid">
        ${fields.map(([k, v]) => `
          <div class="fitem">
            <div class="flabel">${k}</div>
            <div class="fval ${isNA(v) ? 'na' : ''}">${fmtVal(k, v)}</div>
          </div>`).join('')}
      </div>`;
    c.appendChild(card);
  });

  const section = document.getElementById('resultsDiv');
  if (section) section.scrollIntoView({ behavior: 'smooth' });
}

function isNA(v) { return !v || ['N/A','n/a','NA','null','undefined',''].includes(String(v).trim()); }

function fmtVal(key, val) {
  if (isNA(val)) return 'N/A';
  const k = key.toLowerCase();
  const v = String(val);
  const isHttp = v.startsWith('http');
  if (k.includes('website')) return `<a href="${isHttp?v:'https://'+v}" target="_blank">🌐 Website</a>`;
  if (k.includes('linkedin')) return `<a href="${isHttp?v:'https://linkedin.com/company/'+v}" target="_blank">💼 LinkedIn</a>`;
  if (k.includes('facebook')) return `<a href="${isHttp?v:'https://facebook.com/'+v}" target="_blank">📘 Facebook</a>`;
  if (k.includes('instagram')) return `<a href="${isHttp?v:'https://instagram.com/'+v}" target="_blank">📸 Instagram</a>`;
  if (k.includes('twitter') || k.includes('x url')) return `<a href="${isHttp?v:'https://x.com/'+v}" target="_blank">🐦 X / Twitter</a>`;
  if (k.includes('email')) return `<a href="mailto:${v}">✉️ ${v}</a>`;
  if (k.includes('phone') || k.includes('number')) return `📞 ${v}`;
  return v;
}

window.downloadXlsx = function() {
  if (!allResults.length) return;
  const keys = new Set();
  allResults.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
  const ordered = ['Company Name', ...Array.from(keys).filter(k => k !== 'Company Name')];
  const rows = [ordered, ...allResults.map(r => ordered.map(k => r[k] || 'N/A'))];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = ordered.map(() => ({ wch: 30 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Intelligence Report');
  XLSX.writeFile(wb, `Company_Intel_Serper_${new Date().toISOString().slice(0,10)}.xlsx`);
}

window.clearResults = function() {
  allResults = [];
  hideResults();
  document.getElementById('cardsDiv').innerHTML = '';
}

function setLoadStep(step) {
  const s1 = document.getElementById('step1');
  const s2 = document.getElementById('step2');
  if (!s1 || !s2) return;
  s1.className = 'load-step ' + (step > 1 ? 'done' : step === 1 ? 'active' : '');
  s2.className = 'load-step ' + (step > 2 ? 'done' : step === 2 ? 'active' : '');
}

function showLoad(name, idx, total) {
  const el = document.getElementById('loadCompany');
  if (el) el.textContent = total ? `(${idx+1}/${total}) ${name}` : name;
  document.getElementById('loadingDiv').classList.add('show');
  document.getElementById('pbar').style.display = total ? 'block' : 'none';
  setLoadStep(1);
}

function hideLoad() { document.getElementById('loadingDiv').classList.remove('show'); }
function showErr(id, m) { const e = document.getElementById(id); if(e){ e.textContent = '❌ ' + m; e.classList.add('show'); } }
function hideErr(id) { document.getElementById(id)?.classList.remove('show'); }
function hideResults() { document.getElementById('resultsDiv').classList.remove('show'); }
