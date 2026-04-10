/*
 * SJL Kvíz – script.js
 *
 * Architektúra:
 *   - data/themes.json  – ľahký index tém (načíta sa raz pri štarte)
 *   - data/tema-N.json  – otázky konkrétnej témy (načíta sa až po výbere)
 *
 * Pridanie otázky:  otvor data/tema-N.json a pridaj objekt do poľa
 * Pridanie témy:    vytvor data/tema-N.json a pridaj záznam do data/themes.json
 */

'use strict';

// ── Stav ─────────────────────────────────────────────────────
const state = {
  themes:      [],   // zoznam tém z themes.json
  themeId:     null, // vybraná téma
  count:       10,   // vybraný počet otázok
  questions:   [],   // načítané otázky aktuálnej témy
  quiz:        [],   // premiešaný výber otázok
  idx:         0,    // aktuálna otázka
  score:       0,
  answered:    false,
};

// ── DOM ───────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const screens = { intro: $('s-intro'), quiz: $('s-quiz'), result: $('s-result') };

// ── Štart ─────────────────────────────────────────────────────
async function init() {
  await loadThemes();
  bindIntro();
  bindQuiz();
  bindResult();
}

// ── Načítanie tém ─────────────────────────────────────────────
async function loadThemes() {
  try {
    const res = await fetch('data/themes.json');
    state.themes = await res.json();
    renderThemeGrid();
  } catch (e) {
    $('theme-grid').innerHTML = '<p class="loading-msg" style="color:#ad3b3b">Chyba pri načítaní tém.</p>';
  }
}

function renderThemeGrid() {
  const grid = $('theme-grid');
  grid.innerHTML = '';
  state.themes.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 't-btn';
    btn.dataset.id = t.themeId;
    btn.innerHTML = `
      <span class="t-num">${t.themeId}</span>
      <span>
        <strong class="t-name">${t.themeName}</strong>
        <span class="t-meta">${t.questionCount} otázok</span>
      </span>`;
    btn.addEventListener('click', () => selectTheme(t, btn));
    grid.appendChild(btn);
  });
}

// ── Výber témy ────────────────────────────────────────────────
function selectTheme(t, btn) {
  document.querySelectorAll('.t-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  state.themeId = t.themeId;
  state.questions = [];          // vymaž predchádzajúci cache

  $('theme-info').textContent = `${t.themeName} · ${t.questionCount} otázok`;
  $('btn-start').disabled = false;

  // Dim count buttons that exceed available questions
  document.querySelectorAll('.count-btn').forEach(b => {
    const n = +b.dataset.n;
    const tooMany = n > t.questionCount;
    b.classList.toggle('dim', tooMany);
    b.title = tooMany ? `Téma má len ${t.questionCount} otázok` : '';
    // Ak aktívny count je príliš veľký, resetni na 10
    if (tooMany && b.classList.contains('active')) {
      b.classList.remove('active');
      document.querySelector('[data-n="10"]').classList.add('active');
      state.count = 10;
    }
  });
}

// ── Intro bindery ─────────────────────────────────────────────
function bindIntro() {
  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('dim')) return;
      document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.count = +btn.dataset.n;
    });
  });

  $('btn-start').addEventListener('click', startQuiz);
}

// ── Spustenie kvízu ───────────────────────────────────────────
async function startQuiz() {
  if (!state.themeId) return;

  $('btn-start').disabled = true;
  $('btn-start').textContent = 'Načítavam…';

  try {
    // Načítaj otázky len ak ešte nie sú v cache
    if (!state.questions.length) {
      const res = await fetch(`data/tema-${state.themeId}.json`);
      state.questions = await res.json();
    }
  } catch (e) {
    alert('Nepodarilo sa načítať otázky. Skontroluj pripojenie.');
    $('btn-start').disabled = false;
    $('btn-start').textContent = 'Začať kvíz';
    return;
  }

  const actualCount = Math.min(state.count, state.questions.length);
  state.quiz    = shuffle([...state.questions]).slice(0, actualCount).map(prepareQuestion);
  state.idx     = 0;
  state.score   = 0;
  state.answered = false;

  const theme = state.themes.find(t => t.themeId === state.themeId);
  $('lbl-theme').textContent = theme.themeName;
  $('btn-next').textContent  = 'Ďalšia otázka →';
  $('btn-start').disabled    = false;
  $('btn-start').textContent = 'Začať kvíz';

  showScreen('quiz');
  renderQuestion();
}

// ── Quiz bindery ──────────────────────────────────────────────
function bindQuiz() {
  $('btn-verify').addEventListener('click', verifyAnswer);
  $('btn-next').addEventListener('click',   nextQuestion);
  $('btn-back').addEventListener('click', () => {
    if (confirm('Naozaj chceš ukončiť kvíz? Postup sa neuloží.')) goHome();
  });
}

// ── Render otázky ─────────────────────────────────────────────
function renderQuestion() {
  state.answered = false;
  const q     = state.quiz[state.idx];
  const total = state.quiz.length;

  $('lbl-qnum').textContent     = `Otázka ${state.idx + 1} z ${total}`;
  $('lbl-score').textContent    = state.score;
  $('progress').style.width     = `${(state.idx / total) * 100}%`;
  $('q-text').textContent       = q.question;

  $('feedback').classList.add('hidden');
  $('fb-exp').classList.add('hidden');
  $('fb-ans').classList.add('hidden');
  $('btn-verify').classList.remove('hidden');
  $('btn-next').classList.add('hidden');

  const body = $('q-body');
  body.innerHTML = '';

  const render = {
    single:    renderSingle,
    truefalse: renderTrueFalse,
    multiple:  renderMultiple,
    fill:      renderFill,
    matching:  renderMatching,
  };

  (render[q.type] || renderSingle)(q, body);
}

// ── Renderers ─────────────────────────────────────────────────
const LTRS = ['A','B','C','D','E','F'];

function renderSingle(q, body) {
  const list = el('div', 'opt-list');
  (q.options || []).forEach((opt, i) => {
    const btn = el('button', 'opt-btn');
    btn.dataset.v = opt;
    btn.innerHTML = `<span class="opt-ltr">${LTRS[i] || '?'}</span>${opt}`;
    btn.addEventListener('click', () => {
      if (state.answered) return;
      list.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    });
    list.appendChild(btn);
  });
  body.appendChild(list);
}

function renderTrueFalse(q, body) {
  renderSingle({ ...q, options: ['Pravda', 'Nepravda'] }, body);
}

function renderMultiple(q, body) {
  body.appendChild(hint('Vyber všetky správne odpovede'));
  const list = el('div', 'multi-list');
  (q.options || []).forEach(opt => {
    const lbl = el('label', 'multi-item');
    lbl.dataset.v = opt;
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = opt;
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(opt));
    list.appendChild(lbl);
  });
  body.appendChild(list);
}

function renderFill(q, body) {
  const inp = el('input', 'fill-input');
  inp.id = 'fill-inp';
  inp.placeholder = 'Napíš svoju odpoveď…';
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') verifyAnswer(); });
  body.appendChild(inp);
}

function renderMatching(q, body) {
  body.appendChild(hint('Priraď každý pojem k správnemu vysvetleniu'));
  const opts  = shuffle((q.pairs || []).map(p => p.match));
  const list  = el('div', 'match-list');
  (q.pairs || []).forEach(pair => {
    const row  = el('div', 'match-row');
    const term = el('div', 'match-term');
    term.textContent = pair.term;
    const sel = el('select', 'match-sel');
    sel.dataset.term = pair.term;
    sel.innerHTML = '<option value="">— vyber —</option>' +
      opts.map(o => `<option value="${esc(o)}">${o}</option>`).join('');
    row.append(term, sel);
    list.appendChild(row);
  });
  body.appendChild(list);
}

// ── Overenie ──────────────────────────────────────────────────
function verifyAnswer() {
  if (state.answered) return;
  const q = state.quiz[state.idx];
  const map = {
    single:    verifySingle,
    truefalse: verifySingle,
    multiple:  verifyMultiple,
    fill:      verifyFill,
    matching:  verifyMatching,
  };
  const fn = map[q.type];
  if (!fn) return;

  const ok = fn(q);
  if (ok === null) return;   // needAnswer – nevyhodnocuj

  state.answered = true;
  if (ok) state.score++;
  $('lbl-score').textContent = state.score;

  showFeedback(q, ok);
  $('btn-verify').classList.add('hidden');
  $('btn-next').classList.remove('hidden');
  if (state.idx === state.quiz.length - 1)
    $('btn-next').textContent = 'Zobraziť výsledok →';
}

function verifySingle(q) {
  const sel = document.querySelector('.opt-btn.sel');
  if (!sel) return needAnswer();
  document.querySelectorAll('.opt-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.v === q.correctAnswer) btn.classList.add('ok');
    else if (btn.classList.contains('sel')) btn.classList.add('bad');
  });
  setCorrectAnswer(q.correctAnswer);
  return sel.dataset.v === q.correctAnswer;
}

function verifyMultiple(q) {
  const items   = [...document.querySelectorAll('.multi-item')];
  const checked = items.filter(i => i.querySelector('input').checked).map(i => i.dataset.v);
  if (!checked.length) return needAnswer();
  items.forEach(it => {
    it.querySelector('input').disabled = true;
    const v = it.dataset.v;
    const isOk = q.correctAnswer.includes(v);
    const isOn = checked.includes(v);
    if (isOk && isOn)   it.classList.add('ok');
    else if (!isOk && isOn) it.classList.add('bad');
    else if (isOk && !isOn) it.classList.add('miss');
  });
  setCorrectAnswer(q.correctAnswer.join(', '));
  return checked.length === q.correctAnswer.length && q.correctAnswer.every(x => checked.includes(x));
}

function verifyFill(q) {
  const inp = $('fill-inp');
  if (!inp || !inp.value.trim()) return needAnswer();
  const user = norm(inp.value);
  const answers = (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]).map(norm);
  const ok = answers.includes(user);
  inp.disabled = true;
  inp.classList.add(ok ? 'ok' : 'bad');
  setCorrectAnswer(Array.isArray(q.correctAnswer) ? q.correctAnswer[0] : q.correctAnswer);
  return ok;
}

function verifyMatching(q) {
  const sels = [...document.querySelectorAll('.match-sel')];
  if (sels.some(s => !s.value)) return needAnswer();
  let ok = true;
  sels.forEach(sel => {
    sel.disabled = true;
    if (sel.value === q.correctAnswer[sel.dataset.term]) sel.classList.add('ok');
    else { sel.classList.add('bad'); ok = false; }
  });
  setCorrectAnswer((q.pairs || []).map(p => `${p.term} → ${p.match}`).join(' | '));
  return ok;
}

function needAnswer() {
  const box = $('fb-box');
  const fb  = $('feedback');
  box.className = 'fb-box fb-bad';
  box.textContent = 'Najprv odpovedz na otázku.';
  fb.classList.remove('hidden');
  setTimeout(() => { if (!state.answered) fb.classList.add('hidden'); }, 1800);
  return null;
}

// ── Feedback ──────────────────────────────────────────────────
function showFeedback(q, ok) {
  const box = $('fb-box');
  box.className = `fb-box ${ok ? 'fb-ok' : 'fb-bad'}`;
  box.textContent = ok ? '✓ Správne.' : '✗ Nesprávne.';
  $('feedback').classList.remove('hidden');

  if (q.explanation) {
    $('fb-exp').innerHTML = `<span class="fb-lbl">Vysvetlenie:</span>${q.explanation}`;
    $('fb-exp').classList.remove('hidden');
  }
}

function setCorrectAnswer(text) {
  $('fb-ans').innerHTML = `<span class="fb-lbl">Správna odpoveď:</span>${text}`;
  $('fb-ans').classList.remove('hidden');
}

// ── Navigácia ─────────────────────────────────────────────────
function nextQuestion() {
  state.idx++;
  if (state.idx >= state.quiz.length) return showResult();
  renderQuestion();
}

function showResult() {
  const total = state.quiz.length;
  const pct   = Math.round((state.score / total) * 100);
  $('r-score').textContent = `${state.score} / ${total}`;
  $('r-pct').textContent   = `${pct} %`;
  $('r-text').textContent  =
    pct >= 90 ? 'Toto nebol výkrik do tmy, pekne!' :
    pct >= 75 ? 'Lajdačina' :
    pct >= 55 ? 'No, to je smutné.' : 'Bože. Daj mi silu';
  $('r-icon').textContent  =
    pct >= 90 ? '🔥🏆🔥' : pct >= 75 ? '👍👍👍' : pct >= 55 ? '💀' : '👨🏻‍🦯‍➡️🕳️💀⚰️';
  $('r-bar').style.width = '0';
  showScreen('result');
  setTimeout(() => { $('r-bar').style.width = `${pct}%`; }, 120);
}

// ── Result bindery ────────────────────────────────────────────
function bindResult() {
  $('btn-retry').addEventListener('click', () => startQuiz());
  $('btn-home').addEventListener('click',  () => goHome());
}

function goHome() {
  state.themeId = null;
  document.querySelectorAll('.t-btn').forEach(b => b.classList.remove('sel'));
  document.querySelectorAll('.count-btn').forEach(b => { b.classList.remove('dim'); b.title = ''; });
  $('theme-info').textContent = '—';
  $('btn-start').disabled = true;
  showScreen('intro');
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
}

// ── Pomocné funkcie ───────────────────────────────────────────
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function hint(text) {
  const p = el('p', 'hint');
  p.textContent = text;
  return p;
}

function prepareQuestion(q) {
  const copy = structuredClone(q);

  if (Array.isArray(copy.options) && ['single', 'multiple', 'truefalse'].includes(copy.type)) {
    copy.options = shuffle([...copy.options]);
  }

  if (Array.isArray(copy.pairs) && copy.type === 'matching') {
    copy.pairs = shuffle([...copy.pairs]);
  }

  return copy;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function norm(s) {
  return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function esc(s) {
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

// ── Init ──────────────────────────────────────────────────────
init();
