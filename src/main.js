import * as XLSX from 'xlsx';
import './style.css';

let currentMode = 'single';
let uploadedHeaders = [];
let companyNames = [];
let allResults = [];
let savedKey = localStorage.getItem('groq_api_key') || '';

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKeyInput');
  if (savedKey) {
    apiKeyInput.value = savedKey;
  }

  // Handle Enter on search input
  const companyInput = document.getElementById('companyInput');
  if (companyInput) {
    companyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchSingle();
    });
  }

  // File Upload Handlers
  const uploadArea = document.getElementById('uploadArea');
  if (uploadArea) {
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
  }

  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }
});

window.saveApiKey = function() {
  const k = document.getElementById('apiKeyInput').value.trim();
  if (!k || !k.startsWith('gsk_')) {
    alert('Please enter a valid Groq API Key (starts with gsk_...)');
    return;
  }
  savedKey = k;
  localStorage.setItem('groq_api_key', k);
  const el = document.getElementById('apiSaved');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

window.toggleVis = function() {
  const i = document.getElementById('apiKeyInput');
  i.type = i.type === 'password' ? 'text' : 'password';
}

function getKey() {
  return savedKey || document.getElementById('apiKeyInput').value.trim();
}

window.switchMode = function(m) {
  currentMode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('btn-' + m).classList.add('active');
  document.getElementById('panel-' + m).classList.add('active');
  hideResults();
  hideErr('singleError');
  hideErr('excelError');
}

window.searchSingle = async function() {
  const name = document.getElementById('companyInput').value.trim();
  if (!name) return showErr('singleError', 'Please enter a company name!');
  const key = getKey();
  if (!key) return showErr('singleError', 'Please save your Groq API Key first!');

  hideErr('singleError');
  const searchBtn = document.getElementById('searchBtn');
  searchBtn.disabled = true;
  showLoad(`<span style="color:white">"${name}"</span> intel research in progress`);
  hideResults();

  try {
    const d = await groqSearch(name, null, key);
    allResults = [d];
    showCards([d]);
  } catch(e) {
    console.error(e);
    showErr('singleError', e.message);
  } finally {
    searchBtn.disabled = false;
    hideLoad();
  }
}

function handleDragOver(e) { 
  e.preventDefault(); 
  document.getElementById('uploadArea').classList.add('dragover'); 
}

function handleDragLeave() { 
  document.getElementById('uploadArea').classList.remove('dragover'); 
}

function handleDrop(e) { 
  e.preventDefault(); 
  document.getElementById('uploadArea').classList.remove('dragover'); 
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); 
}

function handleFileSelect(e) { 
  if (e.target.files[0]) processFile(e.target.files[0]); 
}

window.clearFile = function() {
  uploadedHeaders = []; companyNames = [];
  document.getElementById('fileInfo').classList.remove('show');
  document.getElementById('headersPreview').style.display = 'none';
  document.getElementById('companiesPreview').style.display = 'none';
  document.getElementById('bulkSearchBtn').disabled = true;
  document.getElementById('fileInput').value = '';
  hideErr('excelError');
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const dataArr = e.target.result;
      const wb = XLSX.read(dataArr, { type: file.name.endsWith('.csv') ? 'binary' : 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      
      if (!data || data.length < 2) { 
        showErr('excelError', 'No data found in the file.'); 
        return; 
      }

      uploadedHeaders = data[0].map(h => String(h).trim()).filter(Boolean);
      companyNames = data.slice(1).map(r => String(r[0] || '').trim()).filter(Boolean);

      document.getElementById('fileName').textContent = file.name;
      document.getElementById('fileStats').textContent = `${companyNames.length} rows · ${uploadedHeaders.length} cols`;
      document.getElementById('fileInfo').classList.add('show');

      document.getElementById('headersPreview').style.display = 'block';
      document.getElementById('headerTags').innerHTML = uploadedHeaders.map(h => `<span class="header-tag">${h}</span>`).join('');

      document.getElementById('companiesPreview').style.display = 'block';
      const prev = companyNames.slice(0, 5);
      document.getElementById('companyListPreview').innerHTML =
        prev.map((n, i) => `<div class="company-row-item"><span class="row-num">${i + 1}</span>${n}</div>`).join('') +
        (companyNames.length > 5 ? `<div style="color:var(--muted);font-size:12px;padding:10px 0;text-align:center">...+ ${companyNames.length - 5} more companies</div>` : '');

      document.getElementById('bulkSearchBtn').disabled = false;
      hideErr('excelError');
    } catch(err) { 
      console.error(err);
      showErr('excelError', 'File Error: ' + err.message); 
    }
  };
  file.name.endsWith('.csv') ? reader.readAsBinaryString(file) : reader.readAsArrayBuffer(file);
}

window.searchBulk = async function() {
  if (!companyNames.length) return;
  const key = getKey();
  if (!key) return showErr('excelError', 'Please save your Groq API Key first!');

  const bulkBtn = document.getElementById('bulkSearchBtn');
  bulkBtn.disabled = true;
  allResults = [];
  hideResults();
  hideErr('excelError');

  const pb = document.getElementById('progressBar');
  const pf = document.getElementById('progressFill');
  pb.style.display = 'block';
  showLoad('Processing Batch Intel...');

  for (let i = 0; i < companyNames.length; i++) {
    const name = companyNames[i];
    document.getElementById('loadingText').innerHTML =
      `Processing (${i + 1}/${companyNames.length}): <strong style="color:var(--accent)">${name}</strong><span>...</span>`;
    pf.style.width = ((i / companyNames.length) * 100) + '%';

    try {
      allResults.push(await groqSearch(name, uploadedHeaders, key));
    } catch(e) {
      console.error(e);
      allResults.push({ 'Company Name': name, 'Error': e.message });
    }

    // Stability delay for Groq API
    if (i < companyNames.length - 1) {
       await new Promise(r => setTimeout(r, 2500));
    }
  }

  pf.style.width = '100%';
  hideLoad();
  pb.style.display = 'none';
  bulkBtn.disabled = false;
  showCards(allResults);
}

async function groqSearch(company, headers, apiKey) {
  const defaultFields = [
    'Website URL', 'Official Email', 'Phone Number',
    'LinkedIn URL', 'Facebook URL', 'Instagram URL', 'Twitter/X URL',
    'Company Address', 'Industry / Sector', 'Founded Year',
    'CEO / Founder Name', 'Number of Employees', 'Short Description'
  ];

  const fields = (headers && headers.length > 1) ? headers.slice(1) : defaultFields;

  const systemPrompt = `You are a professional business researcher. Extracts accurate, up-to-date company data into valid JSON format only. 
Rules:
- JSON format ONLY. No preamble or postscript.
- Use full https:// URLs.
- Include country codes for phones.
- Use N/A if data is truly unavailable.
- Do not hallucinate.`;

  const userPrompt = `Research results for: "${company}"

Return this exact JSON structure:
{
  "Company Name": "${company}",
  ${fields.map(f => `"${f}": "current value or N/A"`).join(',\n  ')}
}`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: 'json_object' }
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err?.error?.message || 'Unknown API Error';
    if (resp.status === 401) throw new Error('Invalid API Key. Get one at console.groq.com.');
    if (resp.status === 429) throw new Error('Rate limit hit. Wait a moment or check Groq limits.');
    throw new Error(`API Error ${resp.status}: ${msg}`);
  }

  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(raw);
    if (!parsed['Company Name']) parsed['Company Name'] = company;
    return parsed;
  } catch (e) {
    console.error("Parse Error", e, raw);
    return { 
      'Company Name': company, 
      'Status': 'Parse Error',
      'Raw': raw.slice(0, 500)
    };
  }
}

function showCards(results) {
  const c = document.getElementById('resultsContainer');
  c.innerHTML = '';
  document.getElementById('resultCount').textContent = results.length;
  document.getElementById('resultsSection').classList.add('show');

  results.forEach((r, idx) => {
    const name = r['Company Name'] || 'Unknown Enterprise';
    const fields = Object.entries(r).filter(([k]) => k !== 'Company Name');
    const card = document.createElement('div');
    card.className = 'company-card';
    card.style.animationDelay = (idx * 0.08) + 's';
    
    card.innerHTML = `
      <div class="company-card-header">
        <div class="company-name">
          <span class="status-dot"></span>${name}
          <small>${fields.length} points extracted · #${idx + 1}</small>
        </div>
        <div class="card-badge" style="font-size:10px; color:var(--accent); font-family: 'Space Mono'">GROQ LLAMA 3.3</div>
      </div>
      <div class="fields-grid">
        ${fields.map(([k, v]) => `
          <div class="field-item">
            <div class="field-label">${k}</div>
            <div class="field-value ${(!v || v === 'N/A') ? 'empty' : ''}">${fmt(k, v)}</div>
          </div>`).join('')}
      </div>`;
    c.appendChild(card);
  });

  window.scrollTo({
    top: document.getElementById('resultsSection').offsetTop - 20,
    behavior: 'smooth'
  });
}

function fmt(key, val) {
  if (!val || val === 'N/A') return 'N/A';
  const k = key.toLowerCase();
  const isHttp = String(val).startsWith('http');
  
  if (k.includes('website') || (k.includes('url') && !k.includes('linkedin') && !k.includes('facebook') && !k.includes('instagram') && !k.includes('twitter') && !k.includes(' x '))) {
    const u = isHttp ? val : 'https://' + val;
    return `<a href="${u}" target="_blank"><span>🌐</span> ${val}</a>`;
  }
  if (k.includes('linkedin')) return `<a href="${isHttp ? val : 'https://linkedin.com/company/' + val}" target="_blank"><span>💼</span> ${val}</a>`;
  if (k.includes('facebook')) return `<a href="${isHttp ? val : 'https://facebook.com/' + val}" target="_blank"><span>📘</span> ${val}</a>`;
  if (k.includes('instagram')) return `<a href="${isHttp ? val : 'https://instagram.com/' + val}" target="_blank"><span>📸</span> ${val}</a>`;
  if (k.includes('twitter') || k.includes(' x ') || k.includes('x url')) return `<a href="${isHttp ? val : 'https://x.com/' + val}" target="_blank"><span>🐦</span> ${val}</a>`;
  if (k.includes('email')) return `<a href="mailto:${val}"><span>✉️</span> ${val}</a>`;
  if (k.includes('phone') || k.includes('number')) return `<span>📞</span> ${val}`;
  return val;
}

window.downloadExcel = function() {
  if (!allResults.length) return;
  const keys = new Set();
  allResults.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
  const ordered = ['Company Name', ...Array.from(keys).filter(k => k !== 'Company Name')];
  
  const rows = [ordered, ...allResults.map(r => ordered.map(k => r[k] || 'N/A'))];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  
  ws['!cols'] = ordered.map(() => ({ wch: 30 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Groq Intel Data');
  XLSX.writeFile(wb, `Groq_Company_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function showLoad(t) { 
  document.getElementById('loadingText').innerHTML = `${t}<span>...</span>`; 
  document.getElementById('loadingDiv').classList.add('show'); 
}

function hideLoad() { 
  document.getElementById('loadingDiv').classList.remove('show'); 
}

function showErr(id, m) { 
  const e = document.getElementById(id); 
  e.textContent = 'intel_error ➜ ' + m; 
  e.classList.add('show'); 
}

function hideErr(id) { 
  const e = document.getElementById(id);
  if (e) e.classList.remove('show'); 
}

function hideResults() { 
  document.getElementById('resultsSection').classList.remove('show'); 
}

window.clearResults = function() {
  allResults = []; 
  hideResults(); 
  document.getElementById('resultsContainer').innerHTML = ''; 
}
