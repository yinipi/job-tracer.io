// --- 1. CONNEXION SUPABASE ---
const supabaseUrl = 'vqarxkorwkwfboxmpqpu'; // Remplacer par ton URL projet
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxYXJ4a29yd2t3ZmJveG1wcXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNDY5NTgsImV4cCI6MjEwNjgyMjk1OH0.me_nSAHzq6RlJivECEU7ui5vDQJw_Cw2f8fm_U6zTus'; // Remplacer par ta clé anon/public
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const STATUTS = [
  {key:'a-envoyer', label:'À envoyer',        color:'var(--slate)'},
  {key:'envoyee',   label:'Envoyée',          color:'var(--amber)'},
  {key:'entretien', label:'Entretien',        color:'var(--blue)'},
  {key:'positive',  label:'Réponse positive', color:'var(--green)'},
  {key:'refusee',   label:'Refusée',          color:'var(--clay)'}
];

let data = [];
let goal = 20;
let editingId = null;
let searchTerm = '';
let statChart = null;

// --- 2. SYNCHRONISATION (Local + Cloud) ---
function persistLocal(){
  try{
    localStorage.setItem('candidatures', JSON.stringify(data));
    localStorage.setItem('candidature_goal', String(goal));
  }catch(e){}
}

async function persist(){
  persistLocal(); 
  if (data.length > 0) {
    await supabase.from('candidatures').upsert(data);
  }
}

async function deleteCandidature(id) {
  data = data.filter(d => d.id !== id);
  persistLocal();
  renderAll();
  await supabase.from('candidatures').delete().eq('id', id);
}

// Chargement initial
async function loadData() {
  try{ 
    const raw = localStorage.getItem('candidatures');
    if(raw) { data = JSON.parse(raw); renderAll(); }
    goal = parseInt(localStorage.getItem('candidature_goal')) || 20;
  }catch(e){}

  const { data: dbData, error } = await supabase.from('candidatures').select('*');
  if(dbData && !error) {
    data = dbData;
    persistLocal();
    renderAll();
  }
}
loadData(); 

// --- UTILITAIRES ---
function esc(s){ if(!s) return ''; return s.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function daysSince(dateStr){ if(!dateStr) return null; const d = new Date(dateStr); const diff = (Date.now()-d.getTime())/86400000; return Math.floor(diff); }

function matchesSearch(c){
  if(!searchTerm) return true;
  const hay = [c.entreprise, c.theme, c.ville, c.poste].join(' ').toLowerCase();
  return hay.includes(searchTerm);
}
function visibleData(){ return data.filter(matchesSearch); }

function toast(message, actionLabel, actionFn, duration=5000){
  const box = document.createElement('div');
  box.className = 'toast';
  box.innerHTML = `<span>${message}</span>`;
  if(actionLabel){
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.addEventListener('click', ()=>{ actionFn(); box.remove(); });
    box.appendChild(btn);
  }
  document.getElementById('toasts').appendChild(box);
  setTimeout(()=>box.remove(), duration);
}

function showConfirm(message, onYes){
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmMsg').textContent = message;
  modal.classList.add('show');
  const yes = document.getElementById('confirmYes');
  const no = document.getElementById('confirmNo');
  const cleanup = ()=>{ modal.classList.remove('show'); yes.onclick=null; no.onclick=null; };
  yes.onclick = ()=>{ cleanup(); onYes(); };
  no.onclick = cleanup;
}

// --- THÈME ---
function applyTheme(mode){
  if(mode==='dark'){ document.documentElement.setAttribute('data-theme','dark'); document.getElementById('themeToggle').textContent='☀️'; }
  else if(mode==='light'){ document.documentElement.setAttribute('data-theme','light'); document.getElementById('themeToggle').textContent='🌙'; }
  else { document.documentElement.removeAttribute('data-theme'); document.getElementById('themeToggle').textContent='🌓'; }
}
let themeMode = localStorage.getItem('theme_mode') || 'auto';
applyTheme(themeMode);
document.getElementById('themeToggle').addEventListener('click', ()=>{
  themeMode = themeMode==='dark' ? 'light' : themeMode==='light' ? 'auto' : 'dark';
  localStorage.setItem('theme_mode', themeMode);
  applyTheme(themeMode);
});

// --- RECHERCHE ---
document.getElementById('searchInput').addEventListener('input', e=>{
  searchTerm = e.target.value.trim().toLowerCase();
  renderBoard(); renderCalendar(); renderCompare(); renderCities();
});

function getRelanceHtml(dateStr) {
  if(!dateStr) return '';
  const today = new Date();
  today.setHours(0,0,0,0);
  const relanceDate = new Date(dateStr);
  const isPast = relanceDate < today;
  const isToday = relanceDate.getTime() === today.getTime();
  let cssClass = isPast ? 'relance-past' : 'relance-future';
  let text = isPast ? '⚠️ Relance en retard : ' : (isToday ? '🔔 À relancer aujourd\'hui' : '⏰ Relance prévue le : ');
  return `<div class="relance ${cssClass}">${text} ${isToday ? '' : dateStr}</div>`;
}

// --- RENDU UI ---
function renderStatRow(){
  const sent = data.filter(d=>d.statut!=='a-envoyer').length;
  const interview = data.filter(d=>['entretien','positive'].includes(d.statut)).length;
  const positive = data.filter(d=>d.statut==='positive').length;
  const pct = (a,b)=> b>0 ? Math.round(a/b*100)+'%' : '—';
  document.getElementById('statRow').innerHTML = `
    <div class="stat-card"><div class="num">${sent}</div><div class="lbl">Envoyées</div></div>
    <div class="stat-card"><div class="num">${interview}</div><div class="lbl">Entretiens (${pct(interview,sent)})</div></div>
    <div class="stat-card"><div class="num">${positive}</div><div class="lbl">Offres (${pct(positive,interview)})</div></div>
    <div class="stat-card goal">
      <div class="row"><span class="lbl">Objectif</span><input type="number" id="goalInput" min="1" value="${goal}"></div>
      <div class="num" style="font-size:1.1rem;">${sent} / ${goal} envoyées</div>
      <div class="track"><div class="fill" id="goalFill" style="width:0%"></div></div>
    </div>`;
  requestAnimationFrame(()=>{
    const fill = document.getElementById('goalFill');
    if(fill) fill.style.width = Math.min(100,(sent/goal)*100)+'%';
  });
  document.getElementById('goalInput').addEventListener('change', e=>{
    goal = Math.max(1, parseInt(e.target.value)||20);
    persist(); renderStatRow();
  });
}

function renderBoard(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  
  STATUTS.forEach(s=>{
    const col = document.createElement('div'); col.className='col';
    const items = visibleData().filter(d=>d.statut===s.key);
    
    col.innerHTML = `
      <div class="col-header">${s.label}<span class="n">${items.length}</span></div>
      <div class="col-content" data-statut="${s.key}">
        ${items.length === 0 ? `<div class="empty">Rien ici pour l'instant</div>` : ''}
      </div>`;
    
    const colContent = col.querySelector('.col-content');
    
    colContent.addEventListener('dragover', e => { e.preventDefault(); colContent.classList.add('drag-over'); });
    colContent.addEventListener('dragleave', e => { colContent.classList.remove('drag-over'); });
    colContent.addEventListener('drop', e => {
      e.preventDefault(); colContent.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const item = data.find(d => d.id === id);
      if(item && item.statut !== s.key) {
        const wasPositive = item.statut==='positive';
        item.statut = s.key;
        persist(); renderAll();
        if(!wasPositive && item.statut==='positive') celebrate(item.entreprise);
      }
    });

    items.forEach(c=>{
      const card = document.createElement('div');
      card.className = 'card statut-'+c.statut;
      card.draggable = true;
      
      card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.id); setTimeout(() => card.classList.add('dragging'), 0); });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); });

      card.innerHTML = `
        <div class="card-top"></div>
        <div class="card-body">
          <h3>${esc(c.entreprise)||'(sans nom)'}</h3>
          <div class="poste">${esc(c.poste)||''}${c.ville?' · '+esc(c.ville):''}</div>
          ${c.theme?`<span class="theme-chip">${esc(c.theme)}</span>`:''}
          <div class="meta">${c.date?'Envoyée le '+c.date:''}${c.dateEntretien?' · Entretien '+c.dateEntretien:''}${c.contact?' · '+esc(c.contact):''}</div>
          ${getRelanceHtml(c.relance)}
          ${c.notes?`<div class="notes">${esc(c.notes)}</div>`:''}
          ${c.appris?`<div class="appris">💡 ${esc(c.appris)}</div>`:''}
          ${c.lien?`<div><a class="lien" href="${esc(c.lien)}" target="_blank" rel="noopener">Voir l'annonce →</a></div>`:''}
          <div class="row">
            <select data-id="${c.id}" class="moveSelect">
              ${STATUTS.map(st=>`<option value="${st.key}" ${st.key===c.statut?'selected':''}>${st.label}</option>`).join('')}
            </select>
            <button class="action-btn edit" data-id="${c.id}" title="Modifier">✏️</button>
            <button class="action-btn del" data-id="${c.id}" title="Supprimer">✕</button>
          </div>
        </div>`;
      colContent.appendChild(card);
    });
    board.appendChild(col);
  });
  
  document.querySelectorAll('.moveSelect').forEach(sel=>{
    sel.addEventListener('change', e=>{
      const id = e.target.dataset.id;
      const item = data.find(d=>d.id===id);
      if(item){
        const wasPositive = item.statut==='positive';
        item.statut = e.target.value;
        persist(); renderAll();
        if(!wasPositive && item.statut==='positive') celebrate(item.entreprise);
      }
    });
  });
  
  document.querySelectorAll('.del').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const id = e.target.dataset.id;
      showConfirm("Supprimer cette candidature ?", ()=>{
        deleteCandidature(id);
        toast("Candidature supprimée ✓");
      });
    });
  });

  document.querySelectorAll('.edit').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const id = e.target.dataset.id;
      const item = data.find(d=>d.id===id);
      if(item) {
        editingId = item.id;
        document.getElementById('f-entreprise').value = item.entreprise || '';
        document.getElementById('f-theme').value = item.theme || '';
        document.getElementById('f-poste').value = item.poste || '';
        document.getElementById('f-ville').value = item.ville || '';
        document.getElementById('f-date').value = item.date || '';
        document.getElementById('f-relance').value = item.relance || '';
        document.getElementById('f-dateEntretien').value = item.dateEntretien || '';
        document.getElementById('f-statut').value = item.statut || 'envoyee';
        document.getElementById('f-contact').value = item.contact || '';
        document.getElementById('f-lien').value = item.lien || '';
        document.getElementById('f-duree').value = item.duree || '';
        document.getElementById('f-remuneration').value = item.remuneration || '';
        document.getElementById('f-missions').value = item.missions || '';
        document.getElementById('f-notes').value = item.notes || '';
        document.getElementById('f-appris').value = item.appris || '';
        
        document.getElementById('form').classList.add('open');
        window.scrollTo(0, 0);
      }
    });
  });
}

function renderCalendar(){
  const panel = document.getElementById('calendar-panel');
  const withDate = visibleData().filter(d=>d.dateEntretien).sort((a,b)=>a.dateEntretien.localeCompare(b.dateEntretien));
  const withoutDate = visibleData().filter(d=>d.statut==='entretien' && !d.dateEntretien);
  let html = '<h2 class="serif" style="font-size:1.2rem;margin-bottom:14px;">Entretiens à venir</h2>';
  if(withDate.length===0) html += '<div class="empty">Aucun entretien planifié pour l\'instant.</div>';
  withDate.forEach(c=>{
    html += `<div class="list-item"><div><div class="date-badge">${c.dateEntretien}</div></div>
      <div style="flex:1;"><b>${esc(c.entreprise)}</b> — ${esc(c.poste)||''}${c.ville?' · '+esc(c.ville):''}${c.theme?'<br><span class="theme-chip" style="background:var(--blue-bg);color:var(--blue);">'+esc(c.theme)+'</span>':''}</div></div>`;
  });
  if(withoutDate.length>0){
    html += '<h2 class="serif" style="font-size:1.05rem;margin:18px 0 10px;">En entretien, sans date précisée</h2>';
    withoutDate.forEach(c=>{ html += `<div class="list-item"><div>${esc(c.entreprise)} — ${esc(c.poste)||''}</div></div>`; });
  }
  panel.innerHTML = html;
}

function renderStats(){
  const panel = document.getElementById('stats-panel');
  const vd = visibleData();
  const themes = {};
  vd.forEach(c=>{
    const t = c.theme && c.theme.trim() ? c.theme.trim() : 'Sans thème';
    themes[t] = themes[t] || {total:0, interview:0, positive:0};
    themes[t].total++;
    if(['entretien','positive'].includes(c.statut)) themes[t].interview++;
    if(c.statut==='positive') themes[t].positive++;
  });
  const keys = Object.keys(themes);
  let html = '<h2 class="serif" style="font-size:1.2rem;margin-bottom:14px;">Répartition du pipeline</h2>';
  html += '<div style="background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:22px;max-width:520px;"><canvas id="statChart" height="180"></canvas></div>';
  html += '<h2 class="serif" style="font-size:1.2rem;margin-bottom:14px;">Taux de conversion par thème</h2>';
  if(keys.length===0) html += '<div class="empty">Ajoute des candidatures avec un thème pour voir les statistiques.</div>';
  keys.sort((a,b)=>themes[b].total-themes[a].total).forEach(t=>{
    const s = themes[t];
    const pct = s.total ? Math.round(s.interview/s.total*100) : 0;
    html += `<div class="theme-stat"><h3>${esc(t)}</h3>
      <div class="figs">${s.total} candidature${s.total>1?'s':''} · ${s.interview} entretien${s.interview>1?'s':''} · ${s.positive} offre${s.positive>1?'s':''}</div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      <div class="figs">${pct}% mènent à un entretien</div></div>`;
  });
  panel.innerHTML = html;

  if(window.Chart){
    const counts = STATUTS.map(s=>vd.filter(d=>d.statut===s.key).length);
    const colors = ['#6B7280','#C6811C','#2E6AA8','#2E9552','#C85A41'];
    const ctx = document.getElementById('statChart');
    if(statChart) statChart.destroy();
    statChart = new Chart(ctx, {
      type:'bar',
      data:{ labels:STATUTS.map(s=>s.label), datasets:[{ data:counts, backgroundColor:colors, borderRadius:6 }] },
      options:{ plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } } }
    });
  }
}

function renderCompare(){
  const panel = document.getElementById('compare-panel');
  const offers = visibleData().filter(d=>d.statut==='positive');
  let html = '<h2 class="serif" style="font-size:1.2rem;margin-bottom:14px;">Comparer les offres reçues</h2>';
  if(offers.length===0){
    html += '<div class="empty">Pas encore d\'offre positive à comparer — ça viendra !</div>';
  } else {
    html += '<div style="overflow-x:auto;"><table class="compare"><tr><th>Entreprise</th><th>Thème</th><th>Ville</th><th>Durée</th><th>Rémunération</th><th>Missions</th></tr>';
    offers.forEach(c=>{
      html += `<tr><td><b>${esc(c.entreprise)}</b></td><td>${esc(c.theme)||'—'}</td><td>${esc(c.ville)||'—'}</td><td>${esc(c.duree)||'—'}</td><td>${esc(c.remuneration)||'—'}</td><td>${esc(c.missions)||'—'}</td></tr>`;
    });
    html += '</table></div>';
  }
  panel.innerHTML = html;
}

function renderCities(){
  const panel = document.getElementById('cities-panel');
  const cities = {};
  visibleData().forEach(c=>{
    const v = c.ville && c.ville.trim() ? c.ville.trim() : 'Ville non précisée';
    cities[v] = cities[v] || [];
    cities[v].push(c);
  });
  const keys = Object.keys(cities);
  let html = '<h2 class="serif" style="font-size:1.2rem;margin-bottom:6px;">Candidatures par ville</h2>';
  html += '<div class="empty" style="margin-bottom:14px;">Vue groupée par ville.</div>';
  if(keys.length===0) html += '<div class="empty">Aucune ville renseignée pour l\'instant.</div>';
  keys.sort((a,b)=>cities[b].length-cities[a].length).forEach(v=>{
    html += `<div class="city-group"><h3>📍 ${esc(v)} <span style="color:var(--sub);font-size:.8rem;">(${cities[v].length})</span></h3><div class="chips">`;
    cities[v].forEach(c=>{ html += `<div class="city-chip"><b>${esc(c.entreprise)}</b>${c.theme?' — '+esc(c.theme):''}</div>`; });
    html += '</div></div>';
  });
  panel.innerHTML = html;
}

function renderAll(){ renderStatRow(); renderBoard(); renderCalendar(); renderStats(); renderCompare(); renderCities(); }

function celebrate(name){
  const el = document.getElementById('celebrate');
  const msg = document.getElementById('celebrateMsg');
  msg.textContent = `🎉 Bravo ! Réponse positive de ${name}`;
  el.querySelectorAll('.confetti').forEach(n=>n.remove());
  const emojis = ['🎉','✨','🎊','⭐'];
  for(let i=0;i<14;i++){
    const s = document.createElement('span');
    s.className='confetti'; s.textContent = emojis[i%emojis.length];
    s.style.left = (Math.random()*90+5)+'%';
    s.style.animationDelay = (Math.random()*.4)+'s';
    el.appendChild(s);
  }
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 2200);
}

// --- FORMULAIRE & ACTIONS ---
function resetForm() {
  editingId = null;
  ['f-entreprise','f-theme','f-poste','f-ville','f-date','f-relance','f-dateEntretien','f-contact','f-lien','f-duree','f-remuneration','f-missions','f-notes','f-appris']
    .forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-statut').value='envoyee';
}

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab+'-panel').classList.add('active');
  });
});

document.getElementById('openForm').addEventListener('click', ()=>{ resetForm(); document.getElementById('form').classList.toggle('open'); });
document.getElementById('cancelBtn').addEventListener('click', ()=>{ document.getElementById('form').classList.remove('open'); resetForm(); });

document.getElementById('saveBtn').addEventListener('click', ()=>{
  const entreprise = document.getElementById('f-entreprise').value.trim();
  if(!entreprise){ toast("Indique au moins le nom de l'entreprise."); return; }
  
  const formData = {
    entreprise, theme: document.getElementById('f-theme').value.trim(), poste: document.getElementById('f-poste').value.trim(),
    ville: document.getElementById('f-ville').value.trim(), date: document.getElementById('f-date').value,
    relance: document.getElementById('f-relance').value, dateEntretien: document.getElementById('f-dateEntretien').value,
    statut: document.getElementById('f-statut').value, contact: document.getElementById('f-contact').value.trim(),
    lien: document.getElementById('f-lien').value.trim(), duree: document.getElementById('f-duree').value.trim(),
    remuneration: document.getElementById('f-remuneration').value.trim(), missions: document.getElementById('f-missions').value.trim(),
    notes: document.getElementById('f-notes').value.trim(), appris: document.getElementById('f-appris').value.trim()
  };

  if(editingId) {
    const index = data.findIndex(d => d.id === editingId);
    if(index !== -1) {
      const wasPositive = data[index].statut === 'positive';
      data[index] = { ...data[index], ...formData };
      if(!wasPositive && data[index].statut === 'positive') celebrate(entreprise);
    }
  } else {
    data.push({ id: Date.now().toString(36), ...formData });
    if(formData.statut === 'positive') celebrate(entreprise);
  }
  
  persist(); resetForm(); document.getElementById('form').classList.remove('open'); renderAll();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  if(data.length === 0) { toast("Aucune donnée à sauvegarder."); return; }
  const dataStr = JSON.stringify(data, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', 'suivi_candidatures_stage.json');
  linkElement.click();
  toast("Fichier téléchargé ✓");
});

document.getElementById('importFile').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      if(Array.isArray(importedData)) {
        showConfirm("Remplacer vos données actuelles par celles du fichier importé ?", ()=>{
          data = importedData; persist(); renderAll(); toast("Importation réussie et synchronisée avec le Cloud !");
        });
      } else { toast("Le format du fichier n'est pas valide."); }
    } catch(err) { toast("Erreur lors de la lecture du fichier JSON."); }
  };
  reader.readAsText(file); this.value = '';
});

document.addEventListener('keydown', e=>{
  const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
  if(e.key==='Escape'){ document.getElementById('form').classList.remove('open'); document.getElementById('confirmModal').classList.remove('show'); } 
  else if((e.key==='n' || e.key==='N') && !typing){ resetForm(); document.getElementById('form').classList.add('open'); document.getElementById('f-entreprise').focus(); }
});

// --- FORMULAIRE & ACTIONS ---
function resetForm() {
  editingId = null;
  ['f-entreprise','f-theme','f-poste','f-ville','f-date','f-relance','f-dateEntretien','f-contact','f-lien','f-duree','f-remuneration','f-missions','f-notes','f-appris']
    .forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-statut').value='envoyee';
}

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab+'-panel').classList.add('active');
  });
});

document.getElementById('openForm').addEventListener('click', ()=>{ resetForm(); document.getElementById('form').classList.toggle('open'); });
document.getElementById('cancelBtn').addEventListener('click', ()=>{ document.getElementById('form').classList.remove('open'); resetForm(); });

document.getElementById('saveBtn').addEventListener('click', ()=>{
  const entreprise = document.getElementById('f-entreprise').value.trim();
  if(!entreprise){ toast("Indique au moins le nom de l'entreprise."); return; }
  
  const formData = {
    entreprise, theme: document.getElementById('f-theme').value.trim(), poste: document.getElementById('f-poste').value.trim(),
    ville: document.getElementById('f-ville').value.trim(), date: document.getElementById('f-date').value,
    relance: document.getElementById('f-relance').value, dateEntretien: document.getElementById('f-dateEntretien').value,
    statut: document.getElementById('f-statut').value, contact: document.getElementById('f-contact').value.trim(),
    lien: document.getElementById('f-lien').value.trim(), duree: document.getElementById('f-duree').value.trim(),
    remuneration: document.getElementById('f-remuneration').value.trim(), missions: document.getElementById('f-missions').value.trim(),
    notes: document.getElementById('f-notes').value.trim(), appris: document.getElementById('f-appris').value.trim()
  };

  if(editingId) {
    const index = data.findIndex(d => d.id === editingId);
    if(index !== -1) {
      const wasPositive = data[index].statut === 'positive';
      data[index] = { ...data[index], ...formData };
      if(!wasPositive && data[index].statut === 'positive') celebrate(entreprise);
    }
  } else {
    data.push({ id: Date.now().toString(36), ...formData });
    if(formData.statut === 'positive') celebrate(entreprise);
  }
  
  persist(); resetForm(); document.getElementById('form').classList.remove('open'); renderAll();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  if(data.length === 0) { toast("Aucune donnée à sauvegarder."); return; }
  const dataStr = JSON.stringify(data, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', 'suivi_candidatures_stage.json');
  linkElement.click();
  toast("Fichier téléchargé ✓");
});

document.getElementById('importFile').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      if(Array.isArray(importedData)) {
        showConfirm("Remplacer vos données actuelles par celles du fichier importé ?", ()=>{
          data = importedData; persist(); renderAll(); toast("Importation réussie et synchronisée avec le Cloud !");
        });
      } else { toast("Le format du fichier n'est pas valide."); }
    } catch(err) { toast("Erreur lors de la lecture du fichier JSON."); }
  };
  reader.readAsText(file); this.value = '';
});

document.addEventListener('keydown', e=>{
  const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
  if(e.key==='Escape'){ document.getElementById('form').classList.remove('open'); document.getElementById('confirmModal').classList.remove('show'); } 
  else if((e.key==='n' || e.key==='N') && !typing){ resetForm(); document.getElementById('form').classList.add('open'); document.getElementById('f-entreprise').focus(); }
});



