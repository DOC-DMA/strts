/*
 * strts – Spieloberfläche
 *
 * Copyright (C) 2021–2023 Luis Walter (daandtu)
 *   Spielablauf und Kodierung nach dem Original: https://github.com/daandtu/Str8ts
 * Copyright (C) 2026 5C
 *   Neu geschrieben am 13.11.2026 (ohne jQuery): Tastaturbedienung, Modus Normal/Notizen,
 *   mobile Darstellung, Speicherung des Spielstands, Erzeugung im Browser.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 * This program is distributed WITHOUT ANY WARRANTY. See the LICENSE file.
 */
(() => {
  'use strict';

  const G = window.StrtsGenerator;
  const { USER, BLACK, BLACKKNOWN } = G;
  const LEVELS = ['', 'Sehr leicht', 'Leicht', 'Mittel', 'Schwer', 'Sehr schwer', 'Ultra'];
  const MAX_LEVEL = LEVELS.length - 1;
  const STORE_KEY = 'strts.state.v1';
  const PREFS_KEY = 'strts.prefs.v1';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const boardWrap = $('#board-wrap');
  const boardEl = $('#board');
  const padEl = $('#pad');
  const timerEl = $('#timer');
  const levelEl = $('#level');
  const toastEl = $('#toast');

  /** Spielstand: { code, level, mode[], solution[], user[], notes[], wrong[], revealed, solved, elapsed } */
  let S = null;
  let selected = -1;
  let notesMode = false;
  let history = [];
  let generating = false;
  let tickStart = null;
  /** Hervorhebung von Zeile, Spalte und gleichen Zahlen (Einstellung, standardmäßig aus) */
  let highlight = false;

  // ---------- Spielfeld aufbauen ----------

  const cells = [];
  for (let i = 0; i < 81; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.setAttribute('role', 'gridcell');
    el.dataset.i = i;
    const val = document.createElement('span');
    val.className = 'val';
    const notes = document.createElement('div');
    notes.className = 'notes';
    for (let n = 1; n <= 9; n++) {
      const s = document.createElement('span');
      s.textContent = n;
      notes.appendChild(s);
    }
    el.append(val, notes);
    boardEl.appendChild(el);
    cells.push({ el, val, notes: Array.from(notes.children), notesEl: notes });
  }

  function dots(n) {
    let html = '<span class="dots" aria-hidden="true">';
    for (let i = 1; i <= MAX_LEVEL; i++) html += `<i${i <= n ? ' class="on"' : ''}></i>`;
    return html + '</span>';
  }
  $$('.dots[data-n]').forEach((el) => { el.outerHTML = dots(Number(el.dataset.n)); });

  // ---------- Darstellung ----------

  const isBlack = (i) => S.mode[i] >= BLACK;
  const isEditable = (i) => S.mode[i] === USER;

  /** Zahl, die im Feld sichtbar ist (0 = keine). */
  function shownValue(i) {
    const m = S.mode[i];
    if (m === BLACK) return 0;
    if (m !== USER) return S.solution[i];
    return S.revealed ? S.solution[i] : S.user[i];
  }

  function render() {
    if (!S) return;
    const selRow = selected >= 0 ? Math.floor(selected / 9) : -1;
    const selCol = selected >= 0 ? selected % 9 : -1;
    const selVal = selected >= 0 ? shownValue(selected) : 0;
    const counts = new Array(10).fill(0);

    for (let i = 0; i < 81; i++) {
      const c = cells[i];
      const m = S.mode[i];
      const black = m >= BLACK;
      const v = shownValue(i);
      if (v) counts[v]++;
      let cls = 'cell';
      if (black) cls += ' black';
      else if (m !== USER) cls += ' given';
      else if (S.revealed && S.user[i] !== S.solution[i]) cls += S.user[i] ? ' wrong' : ' shown';
      else if (S.wrong[i]) cls += ' wrong';
      if (!black) {
        const r = Math.floor(i / 9), col = i % 9;
        if (i === selected) cls += ' sel';
        else if (highlight && selVal && v === selVal) cls += ' same';
        else if (highlight && (r === selRow || col === selCol)) cls += ' peer';
      }
      c.el.className = cls;
      c.val.textContent = v || '';
      const noteBits = (m === USER && !v && !S.revealed) ? S.notes[i] : 0;
      c.notesEl.hidden = !noteBits;
      if (noteBits) {
        for (let n = 1; n <= 9; n++) c.notes[n - 1].className = (noteBits & (1 << n)) ? 'on' : '';
      }
      const r1 = Math.floor(i / 9) + 1, c1 = (i % 9) + 1;
      c.el.setAttribute('aria-label',
        `Zeile ${r1}, Spalte ${c1}: ` + (black ? 'schwarz' + (v ? ' ' + v : '') : (v ? v + (m !== USER ? ' vorgegeben' : '') : 'leer')));
      if (i === selected) c.el.setAttribute('aria-selected', 'true'); else c.el.removeAttribute('aria-selected');
    }
    // Im Ziffernblock Zahlen abschwächen, die schon neunmal vorkommen
    $$('.key[data-digit]', padEl).forEach((k) => k.classList.toggle('done', counts[Number(k.dataset.digit)] >= 9));
  }

  function renderLevel() {
    levelEl.innerHTML = S && S.level ? dots(S.level) + LEVELS[S.level] : '';
  }

  function setMode(notes) {
    notesMode = notes;
    $$('.modes button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.mode === 'notes') === notes)));
  }

  let toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  // ---------- Zeit ----------

  const locked = () => !S || S.solved || S.revealed;

  function startTimer() {
    if (locked() || document.hidden || generating) return;
    if (tickStart === null) tickStart = performance.now();
  }
  function stopTimer() {
    if (tickStart !== null && S) S.elapsed += performance.now() - tickStart;
    tickStart = null;
  }
  function elapsed() {
    return S ? S.elapsed + (tickStart !== null ? performance.now() - tickStart : 0) : 0;
  }
  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function renderTimer() { timerEl.textContent = formatTime(elapsed()); }
  setInterval(renderTimer, 500);

  // ---------- Speichern ----------

  function save() {
    if (!S) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        code: S.code, level: S.level, user: S.user, notes: S.notes, wrong: S.wrong,
        revealed: S.revealed, solved: S.solved, elapsed: Math.round(elapsed()),
      }));
    } catch (e) { /* privater Modus o. Ä.: Spiel funktioniert auch ohne Speicher */ }
  }
  function loadSaved() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      if (data && typeof data.code === 'string' && Array.isArray(data.user) && data.user.length === 81
        && Array.isArray(data.notes) && data.notes.length === 81) return data;
    } catch (e) { /* ignorieren */ }
    return null;
  }

  // ---------- Spiel laden ----------

  function setGame(code, level, saved) {
    const game = G.decode(code);
    if (!game) return false;
    stopTimer();
    S = {
      code, level,
      mode: game.mode, solution: game.solution,
      user: saved ? saved.user.map((v) => (v >= 1 && v <= 9 ? v : 0)) : new Array(81).fill(0),
      notes: saved ? saved.notes.map((v) => (v | 0) & 0x3fe) : new Array(81).fill(0),
      wrong: saved && Array.isArray(saved.wrong) ? saved.wrong.map(Boolean) : new Array(81).fill(false),
      revealed: !!(saved && saved.revealed),
      solved: !!(saved && saved.solved),
      elapsed: saved ? Number(saved.elapsed) || 0 : 0,
    };
    history = [];
    selected = -1;
    const url = new URL(location.href);
    url.search = '?code=' + code + (level ? '&l=' + level : '');
    try { window.history.replaceState(null, '', url); } catch (e) { /* file:// */ }
    renderLevel();
    render();
    renderTimer();
    save();
    startTimer();
    return true;
  }

  // ---------- Erzeugen (Web Worker, sonst im Hauptthread) ----------

  let worker = null;
  let requestId = 0;
  const pending = new Map();

  function generateInline(difficulty) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try { resolve(G.encode(G.generate(difficulty))); } catch (e) { reject(e); }
      }, 40);
    });
  }
  function initWorker() {
    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = (e) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.code);
      };
      worker.onerror = (e) => {
        e.preventDefault();
        worker = null;
        for (const [id, p] of pending) {
          pending.delete(id);
          generateInline(p.difficulty).then(p.resolve, p.reject);
        }
      };
    } catch (e) { worker = null; }
  }
  function requestGame(difficulty) {
    if (!worker) return generateInline(difficulty);
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, { resolve, reject, difficulty });
      worker.postMessage({ id, difficulty });
    });
  }

  async function newGame(level) {
    if (generating) return;
    generating = true;
    stopTimer();
    save();
    boardWrap.classList.add('loading');
    try {
      // Stufe 1 (sehr leicht) … 6 (Ultra) entspricht im Generator 5 … 0
      const code = await requestGame(MAX_LEVEL - level);
      generating = false;
      setGame(code, level, null);
    } catch (e) {
      generating = false;
      toast('Das Rätsel konnte nicht erzeugt werden.');
      startTimer();
    } finally {
      boardWrap.classList.remove('loading');
    }
  }

  // ---------- Eingaben ----------

  function select(i) {
    selected = i;
    render();
  }

  const snapshot = (i) => ({ i, user: S.user[i], notes: S.notes[i], wrong: S.wrong[i] });

  function commit(changes) {
    if (changes.length) history.push(changes);
    if (history.length > 500) history.shift();
    render();
    save();
    checkSolved();
  }

  function enter(digit, asNote) {
    if (locked() || generating || selected < 0 || !isEditable(selected)) return;
    startTimer();
    const i = selected;
    const changes = [snapshot(i)];
    S.wrong[i] = false;
    if (asNote) {
      S.user[i] = 0;
      S.notes[i] ^= 1 << digit;
    } else {
      S.user[i] = S.user[i] === digit ? 0 : digit;
      S.notes[i] = 0;
      if (S.user[i]) {
        // Diese Zahl aus den Notizen derselben Zeile und Spalte streichen
        const row = Math.floor(i / 9), col = i % 9;
        for (let k = 0; k < 9; k++) {
          for (const p of [row * 9 + k, k * 9 + col]) {
            if (p !== i && (S.notes[p] & (1 << digit))) {
              changes.push(snapshot(p));
              S.notes[p] &= ~(1 << digit);
            }
          }
        }
      }
    }
    commit(changes);
  }

  function erase() {
    if (locked() || generating || selected < 0 || !isEditable(selected)) return;
    const i = selected;
    if (!S.user[i] && !S.notes[i]) return;
    const changes = [snapshot(i)];
    S.user[i] = 0; S.notes[i] = 0; S.wrong[i] = false;
    commit(changes);
  }

  function undo() {
    if (locked() || generating) return;
    const changes = history.pop();
    if (!changes) { toast('Nichts rückgängig zu machen'); return; }
    for (let k = changes.length - 1; k >= 0; k--) {
      const c = changes[k];
      S.user[c.i] = c.user; S.notes[c.i] = c.notes; S.wrong[c.i] = c.wrong;
    }
    selected = changes[0].i;
    render();
    save();
  }

  function move(dr, dc) {
    if (!S) return;
    if (selected < 0) {
      for (let i = 0; i < 81; i++) if (!isBlack(i)) { select(i); return; }
      return;
    }
    let r = Math.floor(selected / 9) + dr, c = (selected % 9) + dc;
    while (r >= 0 && r < 9 && c >= 0 && c < 9) {
      if (!isBlack(r * 9 + c)) { select(r * 9 + c); return; }
      r += dr; c += dc;
    }
  }

  function nextFree(dir) {
    if (!S) return;
    const start = selected < 0 ? (dir > 0 ? -1 : 81) : selected;
    for (const wantEmpty of [true, false]) {
      for (let k = 1; k <= 81; k++) {
        const i = (((start + dir * k) % 81) + 81) % 81;
        if (isEditable(i) && (!wantEmpty || !S.user[i])) { select(i); return; }
      }
    }
  }

  // ---------- Aktionen ----------

  function checkSolved() {
    if (locked()) return;
    for (let i = 0; i < 81; i++) if (isEditable(i) && S.user[i] !== S.solution[i]) return;
    stopTimer();
    S.solved = true;
    selected = -1;
    render();
    renderTimer();
    save();
    const dlg = $('#dlg-solved');
    $('.dlg-text', dlg).textContent =
      `Du hast das Rätsel${S.level ? ' (' + LEVELS[S.level] + ')' : ''} in ${formatTime(S.elapsed)} gelöst.`;
    openDialog(dlg).then((result) => {
      if (result === 'new') askNewGame();
      else if (result === 'share') share();
    });
  }

  function check() {
    if (!S || generating) return;
    if (S.revealed) { toast('Die Lösung wird bereits angezeigt'); return; }
    if (S.solved) { toast('Das Rätsel ist gelöst'); return; }
    let wrong = 0, filled = 0, open = 0;
    for (let i = 0; i < 81; i++) {
      if (!isEditable(i)) continue;
      if (!S.user[i]) { open++; continue; }
      filled++;
      S.wrong[i] = S.user[i] !== S.solution[i];
      if (S.wrong[i]) wrong++;
    }
    render();
    save();
    if (!filled) toast('Noch keine Zahl eingetragen');
    else if (wrong) toast(wrong === 1 ? '1 Fehler markiert' : `${wrong} Fehler markiert`);
    else toast(`Alles richtig – noch ${open} ${open === 1 ? 'Feld' : 'Felder'} offen`);
  }

  async function reveal() {
    if (!S || generating) return;
    if (S.revealed || S.solved) { toast(S.solved ? 'Das Rätsel ist gelöst' : 'Die Lösung wird bereits angezeigt'); return; }
    const ok = await confirmDialog('Lösung anzeigen?', 'Die vollständige Lösung wird eingeblendet. Das Rätsel ist damit beendet.', 'Anzeigen');
    if (!ok) return;
    stopTimer();
    S.revealed = true;
    selected = -1;
    render();
    save();
  }

  async function reset() {
    if (!S || generating) return;
    const ok = await confirmDialog('Rätsel leeren?', 'Alle eingetragenen Zahlen und Notizen werden gelöscht, die Zeit beginnt von vorn.', 'Leeren');
    if (!ok) return;
    stopTimer();
    S.user.fill(0); S.notes.fill(0); S.wrong.fill(false);
    S.revealed = false; S.solved = false; S.elapsed = 0;
    history = [];
    selected = -1;
    render();
    renderTimer();
    save();
    startTimer();
  }

  async function askNewGame() {
    if (generating) return;
    const dlg = $('#dlg-new');
    const level = (S && S.level) || 3;
    $$('input[name="level"]', dlg).forEach((inp) => { inp.checked = Number(inp.value) === level; });
    const opened = openDialog(dlg);
    const current = $('input[name="level"]:checked', dlg);
    if (current) current.focus();
    const result = await opened;
    if (result !== 'ok') return;
    const chosen = $('input[name="level"]:checked', dlg);
    newGame(chosen ? Number(chosen.value) : 3);
  }

  async function share() {
    if (!S) return;
    const url = location.origin + location.pathname + '?code=' + S.code + (S.level ? '&l=' + S.level : '');
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: 'strts – Zahlenstraßen', url }); } catch (e) { /* abgebrochen */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link zum Rätsel kopiert');
    } catch (e) {
      window.prompt('Link zum Rätsel:', url);
    }
  }

  // ---------- Dialoge ----------

  function openDialog(dlg) {
    return new Promise((resolve) => {
      dlg.returnValue = '';
      dlg.addEventListener('close', () => { startTimer(); resolve(dlg.returnValue); }, { once: true });
      dlg.showModal();
    });
  }
  function confirmDialog(title, text, okLabel) {
    const dlg = $('#dlg-confirm');
    $('h2', dlg).textContent = title;
    $('.dlg-text', dlg).textContent = text;
    $('button[value="ok"]', dlg).textContent = okLabel;
    return openDialog(dlg).then((v) => v === 'ok');
  }
  // Klick auf den Hintergrund schließt den Dialog
  $$('dialog').forEach((dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); }));

  // ---------- Ereignisse ----------

  boardEl.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !S || generating) return;
    const i = Number(cell.dataset.i);
    if (isBlack(i)) return;
    select(i);
  });

  padEl.addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    if (key.dataset.digit) enter(Number(key.dataset.digit), notesMode);
    else if (key.dataset.cmd === 'undo') undo();
    else if (key.dataset.cmd === 'erase') erase();
    key.blur();
  });

  $('.modes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    setMode(b.dataset.mode === 'notes');
    b.blur();
  });

  const ACTIONS = { new: askNewGame, check, reveal, reset, share, help: () => openDialog($('#dlg-help')) };
  $('.actions').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    b.blur();
    ACTIONS[b.dataset.action]();
  });

  document.addEventListener('keydown', (e) => {
    if ($('dialog[open]')) return;
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); return; }
    if (mod || e.altKey) return;

    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
    const digit = m ? Number(m[1]) : (/^[0-9]$/.test(e.key) ? Number(e.key) : -1);
    if (digit > 0) { e.preventDefault(); enter(digit, e.shiftKey ? !notesMode : notesMode); return; }
    if (digit === 0 || e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); erase(); return; }

    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); move(-1, 0); break;
      case 'ArrowDown': e.preventDefault(); move(1, 0); break;
      case 'ArrowLeft': e.preventDefault(); move(0, -1); break;
      case 'ArrowRight': e.preventDefault(); move(0, 1); break;
      case 'Tab': e.preventDefault(); nextFree(e.shiftKey ? -1 : 1); break;
      case 'Enter':
        if (e.target instanceof HTMLElement && e.target.closest('button, a')) return;
        e.preventDefault(); nextFree(e.shiftKey ? -1 : 1); break;
      case 'm': case 'M': case 'n': case 'N': e.preventDefault(); setMode(!notesMode); break;
      case 'u': case 'U': e.preventDefault(); undo(); break;
      case 'Escape': if (selected >= 0) select(-1); break;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopTimer(); save(); } else if (!$('dialog[open]')) startTimer();
  });
  window.addEventListener('pagehide', () => { stopTimer(); save(); });

  // ---------- Start ----------

  initWorker();
  setMode(false);

  const optHighlight = $('#opt-highlight');
  try { highlight = !!(JSON.parse(localStorage.getItem(PREFS_KEY)) || {}).highlight; } catch (e) { /* Standard */ }
  optHighlight.checked = highlight;
  optHighlight.addEventListener('change', () => {
    highlight = optHighlight.checked;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ highlight })); } catch (e) { /* ohne Speicher */ }
    render();
  });

  const params = new URLSearchParams(location.search);
  const urlCode = params.get('code');
  const urlLevel = Math.max(0, Math.min(MAX_LEVEL, Number(params.get('l')) | 0));
  const saved = loadSaved();

  let started = false;
  if (urlCode) {
    started = (saved && saved.code === urlCode)
      ? setGame(saved.code, saved.level | 0, saved)
      : setGame(urlCode, urlLevel, null);
    if (!started) toast('Der Link enthält kein gültiges Rätsel');
  }
  if (!started && saved) started = setGame(saved.code, saved.level | 0, saved);
  if (!started) newGame(3);
})();
