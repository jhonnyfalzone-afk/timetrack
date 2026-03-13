
// Firebase config incorporata
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDiw1R9acAHdoaEdelhtIdoT-93xW_suwU",
  authDomain: "presenze-falzone-serramenti.firebaseapp.com",
  projectId: "presenze-falzone-serramenti",
  storageBucket: "presenze-falzone-serramenti.firebasestorage.app",
  messagingSenderId: "847672672962",
  appId: "1:847672672962:web:587446239e819b31d3b15b",
  measurementId: "G-MG3JKMNS3L"
};
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  onSnapshot, addDoc, query, where, orderBy, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ===================== GLOBALS =====================
let db, currentUser, unsubscribeLive = null, timerInterval = null;

// ===================== FIREBASE INIT =====================
function getConfig() {
  try { return JSON.parse(localStorage.getItem('fb_config') || 'null'); } catch { return null; }
}

async function initFirebase(config) {
  const app = initializeApp(config);
  db = getFirestore(app);
  window._db = db;
  window._fbModules = { collection, doc, setDoc, getDoc, getDocs, onSnapshot, addDoc, query, where, orderBy, serverTimestamp, Timestamp };
  return db;
}

// ===================== SETUP =====================
window.saveFirebaseConfig = async function() {
  const raw = document.getElementById('firebaseConfigInput').value.trim();
  try {
    const cfg = JSON.parse(raw);
    await initFirebase(cfg);
    // Test connessione
    await getDocs(collection(db, 'users'));
    localStorage.setItem('fb_config', raw);
    document.getElementById('setup').style.display = 'none';
    await checkFirstRun();
    showSplash();
  } catch(e) {
    document.getElementById('setupError').textContent = '❌ Config non valida: ' + e.message;
  }
}

// ===================== FIRST RUN =====================
async function checkFirstRun() {
  const snap = await getDocs(collection(db, 'users'));
  if (snap.empty) {
    // Crea admin di default
    await setDoc(doc(db, 'users', 'admin'), {
      name: 'Admin', pin: '0000', role: 'capo',
      color: '#38bdf8', createdAt: serverTimestamp()
    });
    showToast('👋 Utente Admin creato! PIN: 0000');
  }
}

// ===================== LOGIN =====================
async function showSplash() {
  document.getElementById('splash').style.display = 'flex';
  document.getElementById('loginError').textContent = '';
  const sel = document.getElementById('loginUser');
  sel.innerHTML = '<option value="">⏳ Caricamento...</option>';
  try {
    const snap = await getDocs(collection(db, 'users'));
    sel.innerHTML = '<option value="">— Seleziona —</option>';
    if (snap.empty) {
      document.getElementById('loginError').textContent = '⚠️ Nessun utente trovato nel database.';
      return;
    }
    snap.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.data().name + (d.data().role === 'capo' ? ' 👑' : '');
      sel.appendChild(opt);
    });
  } catch(e) {
    sel.innerHTML = '<option value="">— Errore caricamento —</option>';
    document.getElementById('loginError').textContent = '❌ Errore connessione: ' + e.message;
  }
}
window.reloadUsers = async function() { await showSplash(); }

window.doLogin = async function() {
  const uid = document.getElementById('loginUser').value;
  const pin = document.getElementById('loginPin').value;
  if (!uid || !pin) { document.getElementById('loginError').textContent = 'Seleziona nome e inserisci PIN'; return; }
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists() || snap.data().pin !== pin) {
    document.getElementById('loginError').textContent = '❌ PIN errato';
    return;
  }
  currentUser = { id: uid, ...snap.data() };
  document.getElementById('splash').style.display = 'none';
  startApp();
}

window.doLogout = function() {
  if (typeof _unsubLog !== 'undefined' && _unsubLog) { _unsubLog(); _unsubLog = null; }
  if (typeof _unsubToday !== 'undefined' && _unsubToday) { _unsubToday(); _unsubToday = null; }
  if (typeof _unsubTimbList !== 'undefined' && _unsubTimbList) { _unsubTimbList(); _unsubTimbList = null; }
  if (unsubscribeLive) { unsubscribeLive(); unsubscribeLive = null; }
  currentUser = null;
  if (unsubscribeLive) { unsubscribeLive(); unsubscribeLive = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginPin').value = '';
  document.getElementById('loginError').textContent = '';
  showSplash();
}

// ===================== START APP =====================
function startApp() {
  document.getElementById('app').style.display = 'block';
  const colors = ['#f43f5e','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899'];
  const color = currentUser.color || colors[currentUser.name.charCodeAt(0) % colors.length];
  document.getElementById('topbarName').textContent = currentUser.name;
  document.getElementById('topbarRole').textContent = currentUser.role === 'capo' ? '👑 Capo' : '👤 Collaboratore';
  const av = document.getElementById('topbarAvatar');
  if (currentUser.photoUrl) {
    av.innerHTML = `<img src="${currentUser.photoUrl}" alt="${currentUser.name}" style="width:100%;height:100%;object-fit:cover;">`;
    av.style.background = 'transparent';
  } else {
    av.textContent = currentUser.name[0].toUpperCase();
    av.style.background = color;
  }

  if (currentUser.role === 'capo') {
    document.getElementById('viewCapo').style.display = 'block';
    loadCapoLive();
    populateMonthSelects();
  } else {
    document.getElementById('viewCollaboratore').style.display = 'block';
    document.getElementById('pcName').textContent = currentUser.name;
    populateMonthSelects();
    loadTodayStatus();
    loadLog();
    startLiveTimer();
    setupNotifications();
  }
}

// ===================== UTILS =====================
function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmtTime(ts) {
  const ms = tsToMs(ts);
  if (ms === null) return '—';
  return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateTime(ts) {
  const ms = tsToMs(ts);
  if (ms === null) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function msToDuration(ms) {
  if (!ms || ms <= 0) return '0h 00m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h + 'h ' + String(m).padStart(2, '0') + 'm';
}
// ===== TIMESTAMP UTILITY =====
function tsToMs(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') {
    try { return ts.toDate().getTime(); } catch(e) { return null; }
  }
  if (ts.seconds) return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// ===== ARROTONDAMENTO 15 MINUTI =====
// ENTRATA → quarto d'ora SUCCESSIVO  (07:52 → 08:00)
// USCITA  → quarto d'ora PRECEDENTE  (17:08 → 17:00)
function roundTimestamp(date, type) {
  const ms = 15 * 60 * 1000;
  if (type === 'ingresso') return new Date(Math.ceil(date.getTime() / ms) * ms);
  else return new Date(Math.floor(date.getTime() / ms) * ms);
}

function calcTotalMs(punches, includeOpen = false) {
  let total = 0, lastIn = null;
  const valid = punches.filter(p => tsToMs(p.timestamp) !== null);
  const sorted = [...valid].sort((a, b) => tsToMs(a.timestamp) - tsToMs(b.timestamp));
  for (const p of sorted) {
    const t = tsToMs(p.timestamp);
    if (p.type === 'ingresso') lastIn = t;
    else if (p.type === 'uscita' && lastIn !== null) { total += t - lastIn; lastIn = null; }
  }
  // includeOpen=true solo per il timer live, non per report storici
  if (lastIn !== null && includeOpen) total += Date.now() - lastIn;
  return total;
}

window.showToast = function(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), msg.length > 40 ? 4000 : 2800);
}

// ===================== TABS =====================
window.showTab = function(name, btn) {
  document.getElementById('tab-storico').style.display = name === 'storico' ? 'block' : 'none';
  document.getElementById('tab-mensile').style.display = name === 'mensile' ? 'block' : 'none';
  document.querySelectorAll('#viewCollaboratore .tabs .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (name === 'mensile') loadMensile();
}

window.showColTab = function(name, btn) {
  const punchCard = document.getElementById('punchCard');
  const liveTimer = document.getElementById('liveTimer');
  // Nascondi tutto
  punchCard.style.display = 'none';
  liveTimer.style.display = 'none';
  document.getElementById('tab-storico').style.display = 'none';
  document.getElementById('tab-mensile').style.display = 'none';
  document.getElementById('notifPanel').style.display = 'none';
  document.getElementById('profiloPanel').style.display = 'none';
  document.querySelector('#viewCollaboratore .tabs').style.display = 'none';

  if (name === 'punch') {
    punchCard.style.display = 'block';
    if (window._isPresente) liveTimer.style.display = 'block';
  } else if (name === 'logs') {
    document.getElementById('tab-storico').style.display = 'block';
    loadLog();
  } else if (name === 'mese') {
    document.getElementById('tab-mensile').style.display = 'block';
    loadMensile();
  } else if (name === 'notifiche') {
    document.getElementById('notifPanel').style.display = 'block';
    updateNotifStatus();
  } else if (name === 'profilo') {
    document.getElementById('profiloPanel').style.display = 'block';
    loadProfiloPannel();
  }
  document.querySelectorAll('.bottom-nav .nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

window.showCapoTab = function(name, btn) {
  document.getElementById('capo-live').style.display = name === 'live' ? 'block' : 'none';
  document.getElementById('capo-stats').style.display = name === 'stats' ? 'block' : 'none';
  document.getElementById('capo-team').style.display = name === 'team' ? 'block' : 'none';
  document.querySelectorAll('#viewCapo .tabs .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (name === 'stats') loadCapoStats();
  if (name === 'team') loadTeam();
}

// ===================== COLLABORATORE: STATO OGGI =====================
let _unsubToday = null;
function loadTodayStatus() {
  const { query: q, collection: c, where: w } = window._fbModules;
  const today = todayStr();
  if (_unsubToday) { _unsubToday(); _unsubToday = null; }
  _unsubToday = onSnapshot(
    q(c(db, 'punches'), w('userId', '==', currentUser.id), w('date', '==', today)),
    (snap) => {
      const punches = [];
      snap.forEach(d => punches.push(d.data()));
      updatePunchUI(punches);
    },
    (err) => { showToast('⚠️ Errore: ' + err.message); }
  );
}

function updatePunchUI(punches) {
  const valid = punches.filter(p => tsToMs(p.timestamp) !== null);
  const sorted = [...valid].sort((a, b) => tsToMs(a.timestamp) - tsToMs(b.timestamp));
  const lastIn = [...sorted].reverse().find(p => p.type === 'ingresso');
  const lastOut = [...sorted].reverse().find(p => p.type === 'uscita');
  const lastInMs = lastIn ? tsToMs(lastIn.timestamp) : null;
  const lastOutMs = lastOut ? tsToMs(lastOut.timestamp) : null;
  const isPresente = lastIn && (lastOutMs === null || lastInMs > lastOutMs);
  window._isPresente = isPresente;
  window._punchesToday = valid;

  document.getElementById('pcEntrata').textContent = fmtTime(lastIn?.timestamp);
  document.getElementById('pcUscita').textContent = fmtTime(lastOut?.timestamp);

  // === BANNER STATO GRANDE ===
  let banner = document.getElementById('statusBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'statusBanner';
    banner.style.cssText = 'width:100%;border-radius:14px;padding:18px 20px;margin-bottom:20px;text-align:center;font-family:Syne,sans-serif;transition:all 0.4s;';
    const card = document.querySelector('.punch-card');
    if (card) card.insertBefore(banner, card.querySelector('.punch-times'));
  }

  if (isPresente) {
    const entTime = fmtTime(lastIn?.timestamp);
    banner.style.background = 'rgba(34,197,94,0.18)';
    banner.style.border = '2px solid rgba(34,197,94,0.5)';
    banner.innerHTML = `<div style="font-size:28px;margin-bottom:4px;">🟢</div><div style="font-size:20px;font-weight:800;color:#22c55e;letter-spacing:1px;">SEI IN SEDE</div><div style="font-size:13px;color:#86efac;margin-top:4px;">Entrato alle <strong>${entTime}</strong> — ricordati di timbrare l'uscita!</div>`;
    document.getElementById('liveTimer').style.display = 'block';
  } else if (punches.length > 0) {
    const outTime = fmtTime(lastOut?.timestamp);
    banner.style.background = 'rgba(245,158,11,0.15)';
    banner.style.border = '2px solid rgba(245,158,11,0.4)';
    banner.innerHTML = `<div style="font-size:28px;margin-bottom:4px;">🟡</div><div style="font-size:20px;font-weight:800;color:#f59e0b;letter-spacing:1px;">HAI TIMBRATO USCITA</div><div style="font-size:13px;color:#fcd34d;margin-top:4px;">Uscito alle <strong>${outTime}</strong> — buona giornata!</div>`;
    document.getElementById('liveTimer').style.display = 'none';
  } else {
    banner.style.background = 'rgba(113,113,122,0.12)';
    banner.style.border = '2px solid rgba(113,113,122,0.2)';
    banner.innerHTML = `<div style="font-size:28px;margin-bottom:4px;">⚪</div><div style="font-size:20px;font-weight:800;color:#71717a;letter-spacing:1px;">NON ANCORA TIMBRATO</div><div style="font-size:13px;color:#a1a1aa;margin-top:4px;">Premi ENTRATA quando arrivi in sede</div>`;
    document.getElementById('liveTimer').style.display = 'none';
  }

  // Pill piccola (la manteniamo ma meno prominente)
  const pill = document.getElementById('pcStatus');
  const txt = document.getElementById('pcStatusText');
  if (isPresente) {
    pill.className = 'status-pill presente'; txt.textContent = 'In sede';
  } else if (punches.length > 0) {
    pill.className = 'status-pill assente';
    pill.style.background = 'rgba(245,158,11,0.15)';
    pill.style.borderColor = 'rgba(245,158,11,0.3)';
    pill.querySelector('.status-dot').style.background = '#f59e0b';
    txt.textContent = 'Uscito';
  } else {
    pill.className = 'status-pill assente'; txt.textContent = 'Non registrato oggi';
  }

  document.getElementById('btnEntrata').disabled = isPresente;
  document.getElementById('btnUscita').disabled = !isPresente;
}

function startLiveTimer() {
  timerInterval = setInterval(() => {
    if (window._isPresente && window._punchesToday) {
      const ms = calcTotalMs(window._punchesToday, true);
      document.getElementById('liveTimerVal').textContent = msToDuration(ms);
    }
  }, 10000);
}

// ===================== PUNCH =====================
window.doPunch = async function(type) {
  const { addDoc, collection: c } = window._fbModules;
  const today = todayStr();
  const btn = type === 'ingresso' ? document.getElementById('btnEntrata') : document.getElementById('btnUscita');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const now = new Date();
    const rounded = roundTimestamp(now, type);
    const { Timestamp } = window._fbModules;
    const ts = Timestamp.fromDate(rounded);
    const originalTime = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const roundedTime = rounded.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const wasRounded = originalTime !== roundedTime;
    await addDoc(c(db, 'punches'), {
      userId: currentUser.id,
      userName: currentUser.name,
      type,
      date: today,
      timestamp: ts,
      originalTime: now.toISOString()
    });
    if (wasRounded) {
      showToast(type === 'ingresso'
        ? '✅ Entrata: ' + roundedTime + ' (timbrata alle ' + originalTime + ')'
        : '✅ Uscita: ' + roundedTime + ' (timbrata alle ' + originalTime + ')');
    } else {
      showToast(type === 'ingresso' ? '✅ Entrata registrata: ' + roundedTime : '✅ Uscita registrata: ' + roundedTime);
    }
    await loadTodayStatus();
  } catch(e) {
    showToast('❌ Errore: ' + e.message);
  }
  btn.textContent = type === 'ingresso' ? '↗ ENTRATA' : '↙ USCITA';
  btn.disabled = false;
}

// ===================== LOG COLLABORATORE =====================
let _unsubLog = null;
function loadLog() {
  const { query: q, collection: c, where: w } = window._fbModules;
  const box = document.getElementById("logLog");
  const logBox = document.getElementById("logList");
  if (!logBox) return;
  logBox.innerHTML = "<div class=\"loading\"><div class=\"spinner\"></div>Caricamento...</div>";
  if (_unsubLog) return;
  _unsubLog = onSnapshot(
    q(c(db, "punches"), w("userId", "==", currentUser.id)),
    (snap) => {
      const punches = [];
      snap.forEach(d => punches.push({ id: d.id, ...d.data() }));
      punches.sort((a, b) => (tsToMs(b.timestamp)||0) - (tsToMs(a.timestamp)||0));
      if (!punches.length) { logBox.innerHTML = "<div class=\"empty\">Nessun accesso registrato</div>"; return; }
      const now = Date.now();
      const rows = punches.slice(0, 100).map(p => {
        const isIn = p.type === "ingresso";
        const ms = tsToMs(p.timestamp);
        const canEdit = (now - (ms||0)) < 30 * 60 * 1000;
        const origStr = p.originalTime ? new Date(p.originalTime).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}) : "";
        const origHtml = origStr ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">orig: ${origStr}</div>` : "";
        const color = isIn ? "var(--green)" : "var(--amber)";
        const icon = isIn ? "↗" : "↙";
        const label = isIn ? "Entrata" : "Uscita";
        const editBtn = canEdit ? `<button data-pid="${p.id}" data-ptype="${p.type}" class="btn-collab-correct" style="font-size:10px;padding:3px 8px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.25);color:var(--blue);border-radius:6px;cursor:pointer;font-family:inherit;">✏️ Correggi</button>` : "";
        return `<div class="log-item"><div class="log-icon ${isIn?"in":"out"}">${icon}</div><div class="log-text" style="flex:1;"><div class="log-type" style="color:${color}">${label}</div><div class="log-date">${fmtDateTime(p.timestamp)}</div>${origHtml}</div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;"><div class="log-time" style="color:${color}">${fmtTime(p.timestamp)}</div>${editBtn}</div></div>`;
      });
      logBox.innerHTML = `<div style="padding:8px 20px;">${rows.join("")}</div>`;
      logBox.querySelectorAll(".btn-collab-correct").forEach(btn => {
        btn.addEventListener("click", () => collaboratorCorrect(btn.dataset.pid, btn.dataset.ptype));
      });
    },
    (err) => { logBox.innerHTML = `<div class="error-msg" style="padding:12px;">❌ ${err.message}</div>`; }
  );
}

// ===================== MENSILE COLLABORATORE =====================
function populateMonthSelects() {
  const now = new Date();
  const selIds = ['monthSel', 'capoMonthSel'];
  selIds.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = d.toISOString().slice(0, 7);
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      sel.appendChild(opt);
    }
  });
}

window.loadMensile = async function() {
  const month = document.getElementById('monthSel')?.value;
  if (!month) return;
  const { query: q, collection: c, where: w } = window._fbModules;
  const [y, m] = month.split('-');
  const snap = await getDocs(
    q(c(db, 'punches'), w('userId', '==', currentUser.id), w('date', '>=', month + '-01'), w('date', '<=', month + '-' + String(new Date(parseInt(y), parseInt(m), 0).getDate()).padStart(2,'0')))
  );
  const byDay = {};
  snap.forEach(d => {
    const p = d.data();
    if (!byDay[p.date]) byDay[p.date] = [];
    byDay[p.date].push(p);
  });
  const days = Object.keys(byDay).sort();
  let totalMs = 0;
  days.forEach(d => { totalMs += calcTotalMs(byDay[d]); });
  const totalH = Math.floor(totalMs / 3600000);
  const totalMin = Math.floor((totalMs % 3600000) / 60000);
  document.getElementById('statOre').textContent = totalH + 'h ' + String(totalMin).padStart(2,'0') + 'm';
  document.getElementById('statGiorni').textContent = days.length;

  if (!days.length) { document.getElementById('mensileList').innerHTML = '<div class="empty">Nessuna presenza questo mese</div>'; return; }
  document.getElementById('mensileList').innerHTML =
    '<div style="padding:8px 20px;">' +
    days.reverse().map(day => {
      const punches = byDay[day];
      const ms = calcTotalMs(punches);
      const firstIn = punches.sort((a,b) => {
        const ta = a.timestamp?.toDate?.() || new Date(0);
        const tb = b.timestamp?.toDate?.() || new Date(0);
        return ta - tb;
      }).find(p => p.type === 'ingresso');
      const lastOut = [...punches].reverse().find(p => p.type === 'uscita');
      const d = new Date(day);
      return `<div class="log-item">
        <div class="log-icon in">📅</div>
        <div class="log-text">
          <div class="log-type">${d.toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short' })}</div>
          <div class="log-date">Entrata: ${fmtTime(firstIn?.timestamp)} — Uscita: ${fmtTime(lastOut?.timestamp)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:'Syne',sans-serif;font-weight:700;color:var(--blue);font-size:15px;">${msToDuration(ms)}</div>
        </div>
      </div>`;
    }).join('') + '</div>';
}

// ===================== CAPO: LIVE =====================
function loadCapoLive() {
  const { query: q, collection: c, where: w, onSnapshot: os } = window._fbModules;
  const today = todayStr();
  if (unsubscribeLive) unsubscribeLive();
  unsubscribeLive = os(
    q(c(db, 'punches'), w('date', '==', today)),
    async (snap) => {
      const byUser = {};
      snap.forEach(d => {
        const p = d.data();
        if (!byUser[p.userId]) byUser[p.userId] = { name: p.userName, punches: [] };
        byUser[p.userId].punches.push(p);
      });
      // Prendi tutti gli utenti
      const usersSnap = await getDocs(c(db, 'users'));
      const allUsers = [];
      usersSnap.forEach(d => { allUsers.push({ id: d.id, ...d.data() }); });
      window._allUsersCache = allUsers;
      const workers = allUsers.filter(u => u.role !== 'capo');
      renderLive(workers, byUser);
    }
  );
}

function getStatusFromPunches(punches) {
  if (!punches || !punches.length) return 'assente';
  const valid = punches.filter(p => tsToMs(p.timestamp) !== null);
  if (!valid.length) return 'assente';
  const sorted = [...valid].sort((a, b) => tsToMs(a.timestamp) - tsToMs(b.timestamp));
  return sorted[sorted.length - 1].type === 'ingresso' ? 'presente' : 'uscito';
}

function renderLive(allUsers, byUser) {
  let presenti = 0, usciti = 0, assenti = 0;
  const container = document.getElementById('capoLiveList');
  container.innerHTML = '';

  allUsers.forEach(u => {
    const data = byUser[u.id] || null;
    const status = data ? getStatusFromPunches(data.punches) : 'assente';
    if (status === 'presente') presenti++;
    else if (status === 'uscito') usciti++;
    else assenti++;
    const ms = data ? calcTotalMs(data.punches) : 0;
    const lastIn = data ? [...data.punches].reverse().find(p => p.type === 'ingresso') : null;
    const color = u.color || '#6366f1';

    const row = document.createElement('div');
    row.className = 'emp-row';
    row.innerHTML = `
      <div class="emp-left">
        <div class="emp-avatar" style="background:${color}20;color:${color};">${u.name[0]}</div>
        <div>
          <div class="emp-name">${u.name}</div>
          <div class="emp-sub">${data ? 'Entrata: ' + fmtTime(lastIn?.timestamp) : 'Nessuna timbratura'}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${status === 'uscito' ? `<button class="btn-ripristina" data-uid="${u.id}" data-uname="${u.name}" style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:var(--green);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:11px;font-weight:700;">↩ Ripristina</button>` : ''}
        <div style="text-align:right;">
          <div class="badge ${status}">${status === 'presente' ? '● Presente' : status === 'uscito' ? '◐ Uscito' : '○ Assente'}</div>
          ${ms > 0 ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">${msToDuration(ms)}</div>` : ''}
        </div>
      </div>`;
    container.appendChild(row);
  });

  if (!allUsers.length) container.innerHTML = '<div class="empty">Nessun collaboratore</div>';

  container.querySelectorAll('.btn-ripristina').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const uname = btn.dataset.uname;
      if (!confirm('Eliminare l\'ultima uscita di ' + uname + ' e segnarlo come Presente?')) return;
      const { query: q, collection: c, where: w } = window._fbModules;
      const { deleteDoc, doc: d } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const today = todayStr();
      const snap = await getDocs(q(c(db, 'punches'), w('userId', '==', uid), w('date', '==', today)));
      const punches = [];
      snap.forEach(doc => punches.push({ id: doc.id, ...doc.data() }));
      const sorted = punches.sort((a, b) => (tsToMs(b.timestamp)||0) - (tsToMs(a.timestamp)||0));
      const lastUscita = sorted.find(p => p.type === 'uscita');
      if (lastUscita) {
        await deleteDoc(d(db, 'punches', lastUscita.id));
        showToast('✅ ' + uname + ' è di nuovo Presente!');
      } else {
        showToast('❌ Nessuna uscita trovata oggi');
      }
    });
  });

  document.getElementById('liveCount').textContent = presenti + ' presenti';
  document.getElementById('capoPresenteOra').textContent = presenti;
  document.getElementById('capoUsciti').textContent = usciti;
  document.getElementById('capoAssenti').textContent = assenti;
  document.getElementById('capoTotale').textContent = allUsers.length;
}

// ===================== CAPO: STATS MENSILI =====================
window.loadCapoStats = async function() {
  const month = document.getElementById("capoMonthSel")?.value;
  if (!month) return;
  document.getElementById("capoStatsList").innerHTML = '<div class="loading"><div class="spinner"></div>Caricamento...</div>';
  try {
  const { query: q, collection: c, where: w } = window._fbModules;
  const usersSnap = await getDocs(c(db, "users"));
  const workers = [];
  // FIX: esclude i capi dal report
  usersSnap.forEach(d => { const u = { id: d.id, ...d.data() }; if (u.role !== 'capo') workers.push(u); });

  const year = parseInt(month.split("-")[0]);
  const mon = parseInt(month.split("-")[1]);
  const daysInMonth = new Date(year, mon, 0).getDate();
  // FIX: usa il vero ultimo giorno del mese
  const lastDay = String(daysInMonth).padStart(2, "0");

  const punchSnap = await getDocs(
    q(c(db, "punches"), w("date", ">=", month + "-01"), w("date", "<=", month + "-" + lastDay))
  );
  const byUser = {};
  punchSnap.forEach(d => {
    const p = d.data();
    if (!byUser[p.userId]) byUser[p.userId] = {};
    if (!byUser[p.userId][p.date]) byUser[p.userId][p.date] = [];
    byUser[p.userId][p.date].push(p);
  });

  if (!workers.length) { document.getElementById('capoStatsList').innerHTML = '<div class="empty" style="padding:30px;text-align:center;">👥 Nessun collaboratore nel team</div>'; return; }
  const html = workers.map(u => {
    const days = byUser[u.id] || {};
    const dayKeys = Object.keys(days).sort();
    let totalMs = 0;
    dayKeys.forEach(dk => { totalMs += calcTotalMs(days[dk]); });
    const color = u.color || "#6366f1";
    const totalHours = msToDuration(totalMs);
    const validDays = dayKeys.filter(dk => days[dk].some(p => tsToMs(p.timestamp) !== null));

    let tableRows = "";
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = month + "-" + String(day).padStart(2, "0");
      const d = new Date(dateStr + "T12:00:00");
      const weekday = d.toLocaleDateString("it-IT", { weekday: "short" });
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const punches = days[dateStr] || [];

      let entrata = "-", uscita = "-", ore = "-";
      if (punches.length > 0) {
        const validP = punches.filter(p => tsToMs(p.timestamp) !== null);
        const sorted = [...validP].sort((a, b) => tsToMs(a.timestamp) - tsToMs(b.timestamp));
        const firstIn = sorted.find(p => p.type === "ingresso");
        const lastOut = [...sorted].reverse().find(p => p.type === "uscita");
        if (firstIn) entrata = new Date(tsToMs(firstIn.timestamp)).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        if (lastOut) uscita = new Date(tsToMs(lastOut.timestamp)).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        const ms = calcTotalMs(validP);
        if (ms > 0) ore = msToDuration(ms);
      }

      const rowBg = isWeekend ? "rgba(255,255,255,0.02)" : punches.length > 0 ? "rgba(34,197,94,0.05)" : "transparent";
      const dayColor = isWeekend ? "var(--muted)" : "var(--text)";
      const clickStyle = !isWeekend ? 'cursor:pointer;' : '';
      const hoverAttr = !isWeekend ? `onmouseover="this.style.background='rgba(56,189,248,0.08)'" onmouseout="this.style.background='${rowBg}'"` : '';
      const clickAttr = !isWeekend ? `onclick="openReportDayEdit('${u.id}','${u.name}','${dateStr}')"` : '';
      tableRows += `<tr style="background:${rowBg};${clickStyle}" ${hoverAttr} ${clickAttr}>
        <td style="padding:5px 8px;font-size:12px;color:${dayColor};border-bottom:1px solid rgba(255,255,255,0.04);">${String(day).padStart(2,"0")} <span style="color:var(--muted);font-size:11px;">${weekday}</span>${!isWeekend ? ' <span style="font-size:10px;color:rgba(56,189,248,0.6);">✏️</span>' : ''}</td>
        <td style="padding:5px 8px;font-size:12px;color:var(--green);text-align:center;border-bottom:1px solid rgba(255,255,255,0.04);">${entrata}</td>
        <td style="padding:5px 8px;font-size:12px;color:var(--amber);text-align:center;border-bottom:1px solid rgba(255,255,255,0.04);">${uscita}</td>
        <td style="padding:5px 8px;font-size:12px;color:var(--blue);text-align:center;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04);">${ore}</td>
      </tr>`;
    }

    return `<div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,0.05);border-radius:12px 12px 0 0;border-bottom:1px solid rgba(255,255,255,0.08);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:${color}20;color:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;">${u.name[0]}</div>
          <div>
            <div style="font-weight:700;font-size:15px;">${u.name}</div>
            <div style="font-size:12px;color:var(--muted);">${validDays.length} giorni lavorati</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:20px;color:var(--blue);">${totalHours}</div>
          <div style="font-size:11px;color:var(--muted);">ore totali mese</div>
        </div>
      </div>
      <div style="border-radius:0 0 12px 12px;overflow:hidden;background:rgba(255,255,255,0.02);">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:rgba(255,255,255,0.05);">
              <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-align:left;font-weight:600;">GIORNO</th>
              <th style="padding:6px 8px;font-size:11px;color:var(--green);text-align:center;font-weight:600;">ENTRATA</th>
              <th style="padding:6px 8px;font-size:11px;color:var(--amber);text-align:center;font-weight:600;">USCITA</th>
              <th style="padding:6px 8px;font-size:11px;color:var(--blue);text-align:center;font-weight:600;">ORE</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>`;
  }).join("");
  // Riepilogo totale team
  let teamTotalMs = 0;
  let teamTotalDays = 0;
  workers.forEach(u => {
    const days = byUser[u.id] || {};
    const dayKeys = Object.keys(days);
    dayKeys.forEach(dk => { teamTotalMs += calcTotalMs(days[dk]); });
    teamTotalDays += dayKeys.filter(dk => days[dk].some(p => tsToMs(p.timestamp) !== null)).length;
  });
  const teamSummary = workers.length > 0 ? `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
      <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Collaboratori</div>
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--blue);">${workers.length}</div>
      </div>
      <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Giorni totali</div>
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--green);">${teamTotalDays}</div>
      </div>
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Ore totali</div>
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--amber);">${msToDuration(teamTotalMs)}</div>
      </div>
    </div>` : '';

  // Pulsante Export CSV
  const exportBtn = `<button onclick="exportCSV()" style="width:100%;padding:12px;margin-bottom:16px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);color:var(--green);border-radius:12px;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;cursor:pointer;">📥 Esporta CSV per stipendi</button>`;

  document.getElementById("capoStatsList").innerHTML = (html ? teamSummary + exportBtn + html : '<div class="empty">Nessun dato questo mese</div>');
  // Salva dati per export
  window._lastReportData = { workers, byUser, month, daysInMonth };
  } catch(e) { document.getElementById("capoStatsList").innerHTML = '<div class="error-msg" style="padding:20px;">❌ Errore: ' + e.message + '</div>'; }
}

// ===================== CORREZIONE COLLABORATORE =====================
window.collaboratorCorrect = async function(punchId, type) {
  const cur = new Date().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
  const newTime = prompt((type === 'ingresso' ? 'Correggi ENTRATA' : 'Correggi USCITA') + ' (HH:MM):', cur);
  if (!newTime || !/^\d{2}:\d{2}$/.test(newTime)) { showToast('❌ Formato non valido. Usa HH:MM'); return; }
  const [hh, mm] = newTime.split(':').map(Number);
  if (hh > 23 || mm > 59) { showToast('❌ Orario non valido'); return; }
  const today = todayStr();
  const rawDate = new Date(today + 'T' + String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0') + ':00');
  const rounded = roundTimestamp(rawDate, type);
  const roundedStr = rounded.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
  if (!confirm((type === 'ingresso' ? 'Entrata' : 'Uscita') + ' corretta a: ' + roundedStr + '. Confermi?')) return;
  try {
    const { doc: d, Timestamp } = window._fbModules;
    const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await updateDoc(d(db, 'punches', punchId), {
      timestamp: Timestamp.fromDate(rounded),
      originalTime: rawDate.toISOString(),
      correctedBy: currentUser.name,
      correctedAt: new Date().toISOString()
    });
    showToast('✅ Corretto a ' + roundedStr);
  } catch(e) { showToast('❌ Errore: ' + e.message); }
};

// ===================== EXPORT CSV =====================
window.exportCSV = function() {
  const data = window._lastReportData;
  if (!data) { showToast('❌ Carica prima il report'); return; }
  const { workers, byUser, month, daysInMonth } = data;
  let csv = '﻿'; // BOM per Excel italiano
  csv += 'Collaboratore;Giorno;Entrata;Uscita;Ore\n';
  workers.forEach(u => {
    const days = byUser[u.id] || {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = month + '-' + String(day).padStart(2, '0');
      const punches = days[dateStr] || [];
      if (!punches.length) return;
      const validP = punches.filter(p => tsToMs(p.timestamp) !== null);
      const sorted = [...validP].sort((a,b) => tsToMs(a.timestamp) - tsToMs(b.timestamp));
      const firstIn = sorted.find(p => p.type === 'ingresso');
      const lastOut = [...sorted].reverse().find(p => p.type === 'uscita');
      const ms = calcTotalMs(validP);
      const entrata = firstIn ? new Date(tsToMs(firstIn.timestamp)).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : '-';
      const uscita = lastOut ? new Date(tsToMs(lastOut.timestamp)).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : '-';
      const ore = ms > 0 ? msToDuration(ms).replace('h ',':').replace('m','') : '-';
      const d = new Date(dateStr + 'T12:00:00');
      const giorno = d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});
      csv += `${u.name};${giorno};${entrata};${uscita};${ore}
`;
    }
  });
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'presenze_' + month + '.csv';
  a.click(); URL.revokeObjectURL(url);
  showToast('📥 CSV scaricato!');
};

// ===================== TEAM MANAGEMENT =====================
async function loadTeam() {
  const { collection: c } = window._fbModules;
  const snap = await getDocs(c(db, 'users'));
  const users = [];
  snap.forEach(d => users.push({ id: d.id, ...d.data() }));
  const colors = ['#f43f5e','#f97316','#22c55e','#06b6d4','#6366f1','#a855f7'];
  const html = users.map((u, i) => {
    const color = u.color || colors[i % colors.length];
    const isCapo = u.role === 'capo';
    const isMe = u.id === currentUser.id;
    return `<div class="emp-row">
      <div class="emp-left">
        <div class="emp-avatar" style="background:${color}20;color:${color};">${u.name[0]}</div>
        <div>
          <div class="emp-name">${u.name}</div>
          <div class="emp-sub">${isCapo ? '👑 Capo' : '👤 Collaboratore'} · PIN: ${'•'.repeat(u.pin.length)}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
        ${!isMe ? `<button onclick="toggleRole('${u.id}','${u.role}')" style="background:${isCapo ? 'rgba(234,179,8,0.12)' : 'rgba(99,102,241,0.12)'};border:1px solid ${isCapo ? 'rgba(234,179,8,0.3)' : 'rgba(99,102,241,0.3)'};color:${isCapo ? 'var(--amber)' : '#a5b4fc'};border-radius:8px;padding:5px 9px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;">${isCapo ? '→ Collab.' : '→ Capo'}</button>` : ''}
        ${!isCapo ? `<button onclick="openTimbModal('${u.id}','${u.name}')" style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.2);color:var(--blue);border-radius:8px;padding:6px 10px;cursor:pointer;font-family:inherit;font-size:12px;">📋</button>` : ''}
        ${!isMe ? `<button onclick="removeUser('${u.id}')" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.2);color:var(--red);border-radius:8px;padding:6px 10px;cursor:pointer;font-family:inherit;font-size:12px;">🗑</button>` : '<div style="font-size:12px;color:var(--muted);">Tu</div>'}
      </div>
    </div>`;
  }).join('');
  document.getElementById('teamList').innerHTML = html || '<div class="empty">Nessun membro</div>';
}

window.addUser = async function() {
  const name = document.getElementById('newUserName').value.trim();
  const pin = document.getElementById('newUserPin').value.trim();
  const role = document.getElementById('newUserRole').value;
  if (!name || name.length > 30) { showToast('❌ Nome richiesto (max 30 caratteri)'); return; }
  if (!/^\d{4}$/.test(pin)) { showToast('❌ PIN deve essere esattamente 4 cifre numeriche'); return; }
  const { doc: d, setDoc: sd, serverTimestamp: sts, collection: c } = window._fbModules;
  const colors = ['#f43f5e','#f97316','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899'];
  const snap = await getDocs(c(db, 'users'));
  const color = colors[snap.size % colors.length];
  const uid = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-4);
  await sd(d(db, 'users', uid), { name, pin, role, color, createdAt: sts() });
  showToast('✅ ' + name + ' aggiunto!');
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserPin').value = '';
  loadTeam();
}


// ===================== ADMIN: GESTIONE TIMBRATURE =====================
let _timbUserId = null;
let _timbUserName = null;

window.openTimbModal = async function(uid, uname) {
  _timbUserId = uid;
  _timbUserName = uname;
  document.getElementById('timbModalName').textContent = uname;
  document.getElementById('timbDate').value = todayStr();
  document.getElementById('timbTime').value = '09:00';
  document.getElementById('timbModal').style.display = 'flex';
  await loadTimbList();
};

window.closeTimbModal = function() {
  document.getElementById('timbModal').style.display = 'none';
  _timbUserId = null;
  if (typeof _unsubTimbList !== 'undefined' && _unsubTimbList) { _unsubTimbList(); _unsubTimbList = null; }
};

window.closeTimbModalOutside = function(e) {
  if (e.target.id === 'timbModal') closeTimbModal();
};

let _unsubTimbList = null;
async function loadTimbList() {
  const { query: q, collection: c, where: w } = window._fbModules;
  if (_unsubTimbList) { _unsubTimbList(); _unsubTimbList = null; }
  const container = document.getElementById("timbList");
  container.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px;">⏳ Caricamento...</div>';
  _unsubTimbList = onSnapshot(
    q(c(db, "punches"), w("userId", "==", _timbUserId)),
    (snap) => {
      const punches = [];
      snap.forEach(doc => punches.push({ id: doc.id, ...doc.data() }));
      punches.sort((a,b) => (tsToMs(a.timestamp)||0) - (tsToMs(b.timestamp)||0));

  const container = document.getElementById("timbList");
  if (punches.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px;">Nessuna timbratura</div>';
    return;
  }

  // Store punches globally for button access
  window._timbData = {};
  punches.forEach(p => { window._timbData[p.id] = p; });

  // Group by date
  const byDay = {};
  punches.forEach(p => {
    const date = p.date || p.timestamp?.toDate?.().toISOString().slice(0,10) || "?";
    if (!byDay[date]) byDay[date] = [];
    byDay[date].push(p);
  });

  container.innerHTML = "";
  const days = Object.keys(byDay).sort().reverse();
  days.forEach(date => {
    const d = new Date(date + "T12:00:00");
    const label = d.toLocaleDateString("it-IT", {weekday:"long", day:"2-digit", month:"long"});
    const dayDiv = document.createElement("div");
    dayDiv.style.cssText = "font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:12px 0 6px;";
    dayDiv.textContent = label;
    container.appendChild(dayDiv);

    byDay[date].forEach(p => {
      const tsMs = tsToMs(p.timestamp);
      const timeStr = tsMs ? new Date(tsMs).toLocaleTimeString("it-IT", {hour:"2-digit", minute:"2-digit"}) : "--:--";
      const isIn = p.type === "ingresso";

      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:5px;";
      row.innerHTML = `<div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;">${isIn ? "↗" : "↙"}</span>
          <div style="font-size:13px;font-weight:600;color:${isIn ? "var(--green)" : "var(--amber)"};">${isIn ? "Entrata" : "Uscita"} · ${timeStr}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button data-pid="${p.id}" class="btn-edit-timb" style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.2);color:var(--blue);border-radius:6px;padding:5px 9px;cursor:pointer;font-size:12px;">✏️ Modifica</button>
          <button data-pid="${p.id}" class="btn-del-timb" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.2);color:var(--red);border-radius:6px;padding:5px 9px;cursor:pointer;font-size:12px;">🗑</button>
        </div>`;
      container.appendChild(row);
    });
  });

  // Attach event listeners
  container.querySelectorAll(".btn-edit-timb").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = window._timbData[btn.dataset.pid];
      const ms = tsToMs(p.timestamp);
      const d = ms ? new Date(ms) : new Date();
      editTimb(p.id, p.type, p.date || d.toISOString().slice(0,10), d.getHours(), d.getMinutes());
    });
  });
  container.querySelectorAll(".btn-del-timb").forEach(btn => {
    btn.addEventListener("click", () => deleteTimb(btn.dataset.pid));
  });
    },
    (err) => { document.getElementById("timbList").innerHTML = '<div style="color:var(--red);padding:12px;">❌ ' + err.message + '</div>'; }
  );
}

window.addManualTimb = async function() {
  if (!_timbUserId) return;
  const type = document.getElementById("timbType").value;
  const date = document.getElementById("timbDate").value;
  const time = document.getElementById("timbTime").value;
  if (!date || !time) { showToast("❌ Inserisci data e ora"); return; }
  const { collection: c, Timestamp } = window._fbModules;
  const { addDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
  const rawDate = new Date(date + "T" + time + ":00");
  const rounded = roundTimestamp(rawDate, type);
  const ts = Timestamp.fromDate(rounded);
  const roundedTime = rounded.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const originalTime = rawDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  await addDoc(c(db, "punches"), { userId: _timbUserId, userName: _timbUserName, type, date, timestamp: ts, originalTime: rawDate.toISOString() });
  showToast(originalTime !== roundedTime ? "✅ Aggiunta: " + roundedTime + " (inserita " + originalTime + ")" : "✅ Timbratura aggiunta: " + roundedTime);
  await loadTimbList();
};

window.addFullDay = async function() {
  if (!_timbUserId) return;
  const date = document.getElementById("timbDayDate").value;
  const timeIn = document.getElementById("timbDayIn").value;
  const timeOut = document.getElementById("timbDayOut").value;
  if (!date || !timeIn || !timeOut) { showToast("❌ Inserisci data, entrata e uscita"); return; }
  if (timeOut <= timeIn) { showToast("❌ L'uscita deve essere dopo l'entrata"); return; }
  const { collection: c, Timestamp } = window._fbModules;
  const { addDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
  const rawIn = new Date(date + "T" + timeIn + ":00");
  const rawOut = new Date(date + "T" + timeOut + ":00");
  const roundedIn = roundTimestamp(rawIn, "ingresso");
  const roundedOut = roundTimestamp(rawOut, "uscita");
  await addDoc(c(db, "punches"), { userId: _timbUserId, userName: _timbUserName, type: "ingresso", date, timestamp: Timestamp.fromDate(roundedIn), originalTime: rawIn.toISOString() });
  await addDoc(c(db, "punches"), { userId: _timbUserId, userName: _timbUserName, type: "uscita", date, timestamp: Timestamp.fromDate(roundedOut), originalTime: rawOut.toISOString() });
  const inStr = roundedIn.toLocaleTimeString("it-IT", {hour:"2-digit",minute:"2-digit"});
  const outStr = roundedOut.toLocaleTimeString("it-IT", {hour:"2-digit",minute:"2-digit"});
  showToast("✅ Giornata aggiunta: " + inStr + " → " + outStr);
  await loadTimbList();
};

window.deleteTimb = async function(pid) {
  if (!confirm("Eliminare questa timbratura?")) return;
  const { doc: d } = window._fbModules;
  const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
  await deleteDoc(d(db, "punches", pid));
  showToast("🗑 Timbratura eliminata");
  await loadTimbList();
};

window.editTimb = async function(pid, currentType, date, h, m) {
  // Show inline edit form
  const row = document.querySelector(`[data-timb-id="${pid}"]`);
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:500;padding:20px;";
  const hh = String(h).padStart(2,"0");
  const mm2 = String(m).padStart(2,"0");
  modal.innerHTML = `<div style="background:var(--card);border-radius:16px;padding:24px;width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
    <div style="font-size:16px;font-weight:700;margin-bottom:16px;">✏️ Modifica timbratura</div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Tipo</label>
        <select id="editTimbType" style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text);border-radius:8px;padding:10px;font-family:inherit;font-size:14px;">
          <option value="ingresso" ${currentType==="ingresso"?"selected":""}>↗ Entrata</option>
          <option value="uscita" ${currentType==="uscita"?"selected":""}>↙ Uscita</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Data</label>
        <input type="date" id="editTimbDate" value="${date}" style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text);border-radius:8px;padding:10px;font-family:inherit;font-size:14px;box-sizing:border-box;">
      </div>
      <div>
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Ora</label>
        <input type="time" id="editTimbTime" value="${hh}:${mm2}" style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text);border-radius:8px;padding:10px;font-family:inherit;font-size:14px;box-sizing:border-box;">
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button id="cancelEditTimb" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text);border-radius:10px;padding:12px;cursor:pointer;font-family:inherit;font-size:14px;">Annulla</button>
      <button id="saveEditTimb" style="flex:1;background:var(--blue);color:#000;border:none;border-radius:10px;padding:12px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;">Salva</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  document.getElementById("cancelEditTimb").onclick = () => modal.remove();
  document.getElementById("saveEditTimb").onclick = async () => {
    const newType = document.getElementById("editTimbType").value;
    const newDate = document.getElementById("editTimbDate").value;
    const newTime = document.getElementById("editTimbTime").value;
    if (!newDate || !newTime) { showToast("❌ Compila tutti i campi"); return; }
    const { doc: d, Timestamp } = window._fbModules;
    const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    const rawDate = new Date(newDate + "T" + newTime + ":00");
    const rounded = roundTimestamp(rawDate, newType);
    const ts = Timestamp.fromDate(rounded);
    await updateDoc(d(db, "punches", pid), { type: newType, timestamp: ts, date: newDate, originalTime: rawDate.toISOString() });
    showToast("✅ Modificata → " + rounded.toLocaleTimeString("it-IT", {hour:"2-digit",minute:"2-digit"}));
    modal.remove();
    await loadTimbList();
  };
};


let _reportEditUserId=null,_reportEditUserName=null,_reportEditDate=null;
window.openReportDayEdit=async function(uid,uname,date){
  _reportEditUserId=uid;_reportEditUserName=uname;_reportEditDate=date;
  var d=new Date(date+"T12:00:00");
  document.getElementById("reportDayModalTitle").textContent=uname+" - "+d.toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long"});
  var q=window._fbModules.query,c=window._fbModules.collection,w=window._fbModules.where;
  var snap=await getDocs(q(c(db,"punches"),w("userId","==",uid),w("date","==",date)));
  var punches=[];snap.forEach(function(doc){punches.push(Object.assign({id:doc.id},doc.data()));});
  punches.sort(function(a,b){var ta=a.timestamp&&a.timestamp.toDate?a.timestamp.toDate():new Date(a.timestamp);var tb=b.timestamp&&b.timestamp.toDate?b.timestamp.toDate():new Date(b.timestamp);return ta-tb;});
  function toTime(ts){if(!ts)return"";var t=ts.toDate?ts.toDate():new Date(ts);return String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0");}
  var firstIn=punches.find(function(p){return p.type==="ingresso";});
  var lastOut=punches.slice().reverse().find(function(p){return p.type==="uscita";});
  document.getElementById("reportDayIn").value=firstIn?toTime(firstIn.timestamp):"";
  document.getElementById("reportDayOut").value=lastOut?toTime(lastOut.timestamp):"";
  document.getElementById("reportDayModal").style.display="flex";
};
window.closeReportDayModal=function(){document.getElementById("reportDayModal").style.display="none";};
window.saveReportDay=async function(){
  if(!_reportEditUserId||!_reportEditDate)return;
  var timeIn=document.getElementById("reportDayIn").value;
  var timeOut=document.getElementById("reportDayOut").value;
  var q=window._fbModules.query,c=window._fbModules.collection,w=window._fbModules.where,Ts=window._fbModules.Timestamp;
  var mods=await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
  var snap=await getDocs(q(c(db,"punches"),w("userId","==",_reportEditUserId),w("date","==",_reportEditDate)));
  var dels=[];snap.forEach(function(doc){dels.push(mods.deleteDoc(mods.doc(db,"punches",doc.id)));});
  await Promise.all(dels);
  if(timeIn){var tsIn=Ts.fromDate(new Date(_reportEditDate+"T"+timeIn+":00"));await mods.addDoc(c(db,"punches"),{userId:_reportEditUserId,userName:_reportEditUserName,type:"ingresso",date:_reportEditDate,timestamp:tsIn});}
  if(timeOut){var tsOut=Ts.fromDate(new Date(_reportEditDate+"T"+timeOut+":00"));await mods.addDoc(c(db,"punches"),{userId:_reportEditUserId,userName:_reportEditUserName,type:"uscita",date:_reportEditDate,timestamp:tsOut});}
  showToast("Giorno aggiornato!");closeReportDayModal();await window.loadCapoStats();
};

window.toggleRole = async function(uid, currentRole) {
  if (currentUser.role !== "capo") { showToast("Accesso non autorizzato"); return; }
  var newRole = currentRole === "capo" ? "collaboratore" : "capo";
  var label = newRole === "capo" ? "Capo" : "Collaboratore";
  if (!confirm("Cambiare ruolo a " + label + "?")) return;
  var d = window._fbModules.doc;
  var mods = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
  await mods.updateDoc(d(db, "users", uid), { role: newRole });
  showToast("Ruolo aggiornato: " + label);
  loadTeam();
};

window.removeUser = async function(uid) {
  if (!confirm('Rimuovere questo utente?')) return;
  const { doc: d } = window._fbModules;
  const { deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  await deleteDoc(d(db, 'users', uid));
  showToast('🗑 Utente rimosso');
  loadTeam();
}

// ===================== FOTO PROFILO =====================
let _photoModalUserId = null;
let _photoModalColor = null;
let _photoDataUrl = null;

window.onAvatarClick = function() {
  if (currentUser.role !== 'capo') {
    showColTab('profilo', document.querySelector('.nav-btn:last-child'));
  } else {
    openPhotoModal(currentUser.id, currentUser.name, currentUser.color);
  }
}

window.openPhotoModal = function(uid, name, color) {
  _photoModalUserId = uid;
  _photoModalColor = color || '#6366f1';
  _photoDataUrl = null;
  document.getElementById('photoModalSubtitle').textContent = name;
  document.getElementById('photoFileInput').value = '';
  document.getElementById('btnSavePhoto').disabled = true;
  document.getElementById('btnSavePhoto').style.opacity = '0.4';
  // Preview wrap
  const wrap = document.getElementById('photoPreviewWrap');
  wrap.style.background = _photoModalColor + '20';
  wrap.style.color = _photoModalColor;
  // Cerca foto esistente
  const u = window._allUsersCache?.find(u => u.id === uid);
  if (u?.photoUrl) {
    wrap.innerHTML = `<img src="${u.photoUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;">`;
  } else {
    wrap.innerHTML = `<span style="font-size:36px;font-weight:800;">${name[0]}</span>`;
  }
  document.getElementById('photoModal').style.display = 'flex';
}

window.closePhotoModal = function() {
  document.getElementById('photoModal').style.display = 'none';
  _photoModalUserId = null;
  _photoDataUrl = null;
}

window.closePhotoModalOutside = function(e) {
  if (e.target.id === 'photoModal') closePhotoModal();
}

window.onPhotoSelected = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    _photoDataUrl = ev.target.result;
    // Resize a 200x200
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      // Crop quadrato centrato
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      _photoDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      document.getElementById('photoPreviewWrap').innerHTML =
        `<img src="${_photoDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      document.getElementById('btnSavePhoto').disabled = false;
      document.getElementById('btnSavePhoto').style.opacity = '1';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

window.savePhoto = async function() {
  if (!_photoDataUrl || !_photoModalUserId) return;
  const btn = document.getElementById('btnSavePhoto');
  btn.textContent = '...'; btn.disabled = true;
  try {
    const { doc: d, setDoc: sd } = window._fbModules;
    const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await updateDoc(d(db, 'users', _photoModalUserId), { photoUrl: _photoDataUrl });
    // Aggiorna cache locale
    if (window._allUsersCache) {
      const u = window._allUsersCache.find(u => u.id === _photoModalUserId);
      if (u) u.photoUrl = _photoDataUrl;
    }
    // Se è l'utente corrente, aggiorna topbar e profilo
    if (currentUser.id === _photoModalUserId) {
      currentUser.photoUrl = _photoDataUrl;
      const av = document.getElementById('topbarAvatar');
      av.innerHTML = `<img src="${_photoDataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
      av.style.background = 'transparent';
      loadProfiloPannel();
    }
    showToast('✅ Foto salvata!');
    closePhotoModal();
    // Ricarica team se siamo nella vista team
    if (document.getElementById('capo-team')?.style.display !== 'none') loadTeam();
    if (currentUser.role === 'capo') loadCapoLive();
  } catch(e) {
    showToast('❌ Errore: ' + e.message);
  }
  btn.textContent = 'Salva'; btn.disabled = false; btn.style.opacity = '1';
}

function loadProfiloPannel() {
  document.getElementById('profileName').textContent = currentUser.name;
  document.getElementById('profileRoleLabel').textContent = currentUser.role === 'capo' ? '👑 Capo' : '👤 Collaboratore';
  const wrap = document.getElementById('profileAvatarWrap');
  const color = currentUser.color || '#6366f1';
  wrap.style.background = color + '20';
  wrap.style.color = color;
  if (currentUser.photoUrl) {
    document.getElementById('profileAvatarInitial').outerHTML =
      `<img id="profileAvatarInitial" src="${currentUser.photoUrl}" alt="${currentUser.name}" style="width:100%;height:100%;object-fit:cover;">`;
  } else {
    const el = document.getElementById('profileAvatarInitial');
    if (el) el.textContent = currentUser.name[0];
  }
}

// Cache utenti per il modale
window._allUsersCache = [];

// ===================== NOTIFICHE =====================

// Chiedi permesso notifiche dopo il login
async function setupNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission === 'granted') {
    scheduleReminderCheck();
  }
}

function scheduleReminderCheck() {
  // Controlla ogni minuto se è ora di mandare un reminder
  setInterval(checkAndNotify, 60 * 1000);
  checkAndNotify(); // controlla subito al login
}

async function checkAndNotify() {
  if (!currentUser || currentUser.role === 'capo') return;
  if (Notification.permission !== 'granted') return;

  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // Orario reminder uscita: 18:00 (personalizzabile)
  const reminderHour = parseInt(localStorage.getItem('reminderHour') || '18');
  const reminderMinute = 0;

  // Invia notifica solo una volta al giorno (controlla se già inviata oggi)
  const todayKey = 'notified_' + todayStr();
  if (localStorage.getItem(todayKey)) return;

  if (hour === reminderHour && minute === reminderMinute) {
    // Controlla se l'utente è ancora "presente" (non ha timbrato uscita)
    if (window._isPresente) {
      localStorage.setItem(todayKey, '1');
      sendNotification(
        '⚠️ Hai dimenticato di timbrare!',
        'Sei ancora risultato IN SEDE. Ricordati di timbrare l\'uscita prima di andare! 👋'
      );
    }
  }

  // Reminder mattutino alle 9:00 se non ha ancora timbrato
  const morningKey = 'notified_morning_' + todayStr();
  if (hour === 9 && minute === 0 && !localStorage.getItem(morningKey)) {
    const punches = window._punchesToday || [];
    if (punches.length === 0) {
      localStorage.setItem(morningKey, '1');
      sendNotification(
        '👋 Buongiorno ' + currentUser.name + '!',
        'Non hai ancora timbrato l\'entrata. Apri l\'app per registrarti! ⏱'
      );
    }
  }
}

function sendNotification(title, body) {
  if (Notification.permission !== 'granted') return;
  const n = new Notification(title, {
    body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%2309090b"/><text y=".9em" font-size="80">⏱</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="80">⏱</text></svg>',
    vibrate: [200, 100, 200],
    tag: 'timetrack-reminder',
    requireInteraction: true
  });
  n.onclick = () => { window.focus(); n.close(); };
}

// UI per impostare orario reminder (mostrata nelle impostazioni)
window.saveReminderHour = function() {
  const h = document.getElementById('reminderHourInput')?.value;
  if (h) {
    localStorage.setItem('reminderHour', h);
    showToast('✅ Reminder impostato alle ' + h + ':00');
  }
}

window.testNotification = function() {
  if (Notification.permission !== 'granted') {
    showToast('❌ Abilita prima le notifiche');
    return;
  }
  sendNotification(
    '⏱ Test notifica TimeTrack',
    'Le notifiche funzionano correttamente! Riceverai i reminder automatici. ✅'
  );
}


// Aggiorna stato notifiche nella UI
function updateNotifStatus() {
  const el = document.getElementById('notifStatus');
  if (!el) return;
  if (!('Notification' in window)) {
    el.innerHTML = '❌ <strong>Notifiche non supportate</strong> da questo browser.';
    el.style.color = 'var(--red)';
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    const h = localStorage.getItem('reminderHour') || '18';
    const sel = document.getElementById('reminderHourInput');
    if (sel) sel.value = h;
    el.innerHTML = '✅ <strong>Notifiche attive!</strong> Riceverai un reminder alle ' + h + ':00 se non hai timbrato l\'uscita.';
    el.style.color = 'var(--green)';
  } else if (perm === 'denied') {
    el.innerHTML = '🚫 <strong>Notifiche bloccate.</strong> Vai nelle impostazioni del browser e abilita le notifiche per questo sito.';
    el.style.color = 'var(--red)';
  } else {
    el.innerHTML = '⚠️ <strong>Notifiche non ancora abilitate.</strong> Clicca "Salva orario reminder" per attivarle.';
    el.style.color = 'var(--amber)';
  }
}

// ===================== BOOT =====================
(async function boot() {
  try {
    await initFirebase(FIREBASE_CONFIG);
    localStorage.setItem('fb_config', JSON.stringify(FIREBASE_CONFIG));
    await checkFirstRun();
    showSplash();
  } catch(e) {
    document.getElementById('setup').style.display = 'flex';
    document.getElementById('splash').style.display = 'none';
    document.getElementById('setupError').textContent = '⚠️ Errore connessione: ' + e.message;
  }
})();
