import * as XLSX from 'xlsx';
import './style.css';

// API Configuration - Internal 11za Gateway
const API_BASE = '/api';

let currentMode = 'single';
let uploadedHeaders = [];
let companyNames = [];
let allResults = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
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

// Tab Switcher
window.switchTab = function(t) {
  currentMode = t;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('bg-brand-green', 'text-white'));
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('btn-' + t).classList.add('bg-brand-green', 'text-white');
  document.getElementById('panel-' + t).classList.remove('hidden');
  hideResults();
}

// Single Research Handler
window.searchSingle = async function() {
  const name = document.getElementById('companyInput').value.trim();
  if (!name) return showErr('singleError', 'Business name required!');

  hideErr('singleError');
  const searchBtn = document.getElementById('searchBtn');
  searchBtn.disabled = true;
  showLoad(name);
  hideResults();

  try {
    const result = await researchCompany(name, null);
    allResults = [result];
    renderCards([result]);
  } catch(e) {
    console.error('11za Sync Error:', e.message);
    showErr('singleError', 'Intelligence sync failed. System retrying...');
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
      if (!rows || rows.length < 2) { showErr('excelError', 'Empty data set detected.'); return; }

      uploadedHeaders = rows[0].map(h => String(h).trim()).filter(Boolean);
      companyNames = rows.slice(1).map(r => String(r[0] || '').trim()).filter(Boolean);

      document.getElementById('fileName').textContent = file.name;
      document.getElementById('fileStats').textContent = `${companyNames.length} profiles queued for research`;
      document.getElementById('fileInfo').classList.remove('hidden');
      document.getElementById('fileInfo').classList.add('flex');

      document.getElementById('hdrPreview').classList.remove('hidden');
      document.getElementById('hdrTags').innerHTML = uploadedHeaders.map(h => `<span class="badge-tag ring-1 ring-brand-green/20">${h}</span>`).join('');

      document.getElementById('coPreview').classList.remove('hidden');
      const prev = companyNames.slice(0, 5);
      document.getElementById('coList').innerHTML =
        prev.map((n, i) => `<div class="flex items-center gap-3 p-3 bg-white border border-brand-border rounded-xl text-sm"><span class="text-brand-green font-bold text-xs">0${i+1}</span> ${n}</div>`).join('') +
        (companyNames.length > 5 ? `<div class="text-xs text-brand-muted text-center pt-2 italic">...+${companyNames.length - 5} records in pool</div>` : '');

      document.getElementById('bulkBtn').disabled = false;
      hideErr('excelError');
    } catch(err) { showErr('excelError', 'Format Error: Update file to .xlsx or .csv'); }
  };
  file.name.endsWith('.csv') ? reader.readAsBinaryString(file) : reader.readAsArrayBuffer(file);
}

window.clearFile = function() {
  uploadedHeaders = []; companyNames = [];
  document.getElementById('fileInfo').classList.add('hidden');
  document.getElementById('hdrPreview').classList.add('hidden');
  document.getElementById('coPreview').classList.add('hidden');
  document.getElementById('bulkBtn').disabled = true;
  document.getElementById('fileInput').value = '';
  hideErr('excelError');
}

window.doBulk = async function() {
  if (!companyNames.length) return;
  document.getElementById('bulkBtn').disabled = true;
  allResults = []; hideResults(); hideErr('excelError');

  const pf = document.getElementById('pfill');
  const loadingDiv = document.getElementById('loadingDiv');
  loadingDiv.classList.remove('hidden');

  for (let i = 0; i < companyNames.length; i++) {
    const name = companyNames[i];
    showLoad(name, i, companyNames.length);
    pf.style.width = ((i / companyNames.length) * 100) + '%';

    try {
      allResults.push(await researchCompany(name, uploadedHeaders));
    } catch(e) {
      allResults.push({ 'Business Profile': name, 'Status': 'Manual Sync Required' });
    }

    if (i < companyNames.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  pf.style.width = '100%';
  hideLoad();
  document.getElementById('bulkBtn').disabled = false;
  renderCards(allResults);
}

// ── 11ZA INTELLIGENCE ORCHESTRATOR ───────────────────────────
async function researchCompany(company, headers) {
  setLoadStep(1);
  const searchData = await search11za(company);

  setLoadStep(2);
  const result = await extract11za(company, searchData, headers);
  return result;
}

// ── 11ZA DIGITAL CRAWL ─────────────────────────────
async function search11za(company) {
  let combined = '';
  const queries = [`"${company}" official contact website email phone`, `"${company}" locals linkedin socials`];

  for (const q of queries) {
    try {
      const resp = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q })
      });
      if (!resp.ok) continue;
      
      const data = await resp.json();
      if (data.knowledgeGraph) {
        const kg = data.knowledgeGraph;
        combined += `[DATA] ${kg.title} | ${kg.website} | ${kg.phoneNumber} | ${kg.description}\n`;
      }
      (data.organic || []).slice(0, 4).forEach(r => combined += `[INTEL] ${r.snippet}\n\n`);
    } catch(e) { console.warn('Crawl intermittent issue'); }
  }
  return combined || `No public records available for ${company}.`;
}

// ── 11ZA NEURAL PARSING ─────────────────────────
async function extract11za(company, context, headers) {
  const fields = (headers && headers.length > 1) ? headers.slice(1) : ['Website', 'Email', 'Phone', 'LinkedIn', 'Corporate Summary'];

  const resp = await fetch(`${API_BASE}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are 11za Neural Engine. Extract corporate data. JSON only.' },
        { role: 'user', content: `Target: "${company}"\nPool: ${context.slice(0, 3000)}\nKeys: ${fields.join(', ')}` }
      ],
      response_format: { type: 'json_object' }
    })
  });
  
  if (!resp.ok) throw new Error(`Neural Link Offline ${resp.status}`);
  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw);
    parsed['Business Profile'] = parsed['Business Profile'] || company;
    return parsed;
  } catch (e) { return { 'Business Profile': company, 'Status': 'Neural Sync Interrupted' }; }
}

function renderCards(results) {
  const c = document.getElementById('cardsDiv');
  c.innerHTML = '';
  document.getElementById('rcount').textContent = results.length;
  document.getElementById('resultsDiv').classList.remove('hidden');

  results.forEach((r, idx) => {
    const name = r['Business Profile'] || r['Company Name'] || 'Enterprise Profile';
    const fields = Object.entries(r).filter(([k]) => k !== 'Business Profile' && k !== 'Company Name');
    const card = document.createElement('div');
    card.className = 'glass-card overflow-hidden animate-slide-up';
    card.style.animationDelay = `${idx * 0.05}s`;
    
    card.innerHTML = `
      <div class="px-8 py-6 bg-slate-50/50 border-b border-brand-border flex justify-between items-center">
        <div>
          <h3 class="text-xl font-bold text-brand-navy">💎 ${name}</h3>
          <p class="text-xs text-brand-muted mt-0.5">${fields.length} data vectors mapped · #${idx+1}</p>
        </div>
        <div class="px-4 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full ring-1 ring-emerald-200 uppercase">Verified Sync</div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100">
        ${fields.map(([k, v]) => `
          <div class="p-6 bg-white hover:bg-slate-50 transition-colors">
            <span class="block text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-2">${k}</span>
            <span class="text-sm text-brand-navy font-medium ${isNA(v) ? 'italic text-slate-400 font-normal' : ''}">${fmtVal(k, v)}</span>
          </div>`).join('')}
      </div>`;
    c.appendChild(card);
  });
}

function isNA(v) { return !v || ['n/a','na','null','undefined','not found','missing'].includes(String(v).trim().toLowerCase()); }

function fmtVal(key, val) {
  if (isNA(val)) return 'Data Unavailable';
  const k = key.toLowerCase(), v = String(val), h = v.startsWith('http');
  if (k.includes('website')) return `<a href="${h?v:'https://'+v}" target="_blank" class="text-brand-green font-bold text-xs px-3 py-1 bg-brand-green/10 rounded-lg">Access Site →</a>`;
  if (k.includes('linkedin')) return `<a href="${h?v:'https://linkedin.com/company/'+v}" target="_blank" class="text-brand-green underline underline-offset-4">LinkedIn</a>`;
  if (k.includes('email')) return `<a href="mailto:${v}" class="text-brand-green border-b border-dotted border-brand-green">${v}</a>`;
  if (k.includes('phone') || k.includes('number')) return `<span class="text-brand-navy font-semibold">📞 ${v}</span>`;
  return v;
}

window.downloadXlsx = function() {
  if (!allResults.length) return;
  const keys = new Set();
  allResults.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
  const ordered = ['Business Profile', ...Array.from(keys).filter(k => k !== 'Business Profile')];
  const rows = [ordered, ...allResults.map(r => ordered.map(k => r[k] || 'N/A'))];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Intelligence Sync');
  XLSX.writeFile(wb, `11za_DataHunter_Report.xlsx`);
}

window.clearResults = function() { allResults = []; hideResults(); document.getElementById('cardsDiv').innerHTML = ''; }
function setLoadStep(step) {
  const s1 = document.getElementById('step1'), s2 = document.getElementById('step2');
  if (!s1 || !s2) return;
  s1.classList.toggle('text-brand-green', step >= 1);
  s1.classList.toggle('font-bold', step === 1);
  s2.classList.toggle('text-brand-green', step >= 2);
  s2.classList.toggle('font-bold', step === 2);
}
function showLoad(name, idx, total) {
  document.getElementById('loadCompany').textContent = total ? `SYNCING: ${name} (${idx+1}/${total})` : `SYNCING: ${name}`;
  document.getElementById('loadingDiv').classList.remove('hidden');
  setLoadStep(1);
}
function hideLoad() { document.getElementById('loadingDiv').classList.add('hidden'); }
function showErr(id, m) { const e = document.getElementById(id); if(e){ e.textContent = '🛡️ ' + m; e.classList.remove('hidden'); } }
function hideErr(id) { document.getElementById(id)?.classList.add('hidden'); }
function hideResults() { document.getElementById('resultsDiv').classList.add('hidden'); }
