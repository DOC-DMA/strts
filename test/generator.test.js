// Prüft den Generator: Regeln, Eindeutigkeit, Kodierung und Laufzeit.
// Aufruf: node test/generator.test.js [Anzahl je Stufe]
//   oder (macOS ohne Node): jsc -e "load('js/generator.js')" test/generator.test.js -- 5
'use strict';
const isNode = typeof require === 'function';
const G = isNode ? require('../js/generator.js') : globalThis.StrtsGenerator;
const argv = isNode ? process.argv.slice(2) : (typeof scriptArgs !== 'undefined' ? scriptArgs : arguments);
const N = Number(argv[0] || 5);
const log = typeof console !== 'undefined' ? (...a) => log(...a) : print;
const black = (m) => m >= G.BLACK;

function checkSolution(game) {
  const { mode, solution: s } = game;
  for (let r = 0; r < 9; r++) {
    const row = new Set(), col = new Set();
    for (let c = 0; c < 9; c++) {
      const a = s[r * 9 + c], b = s[c * 9 + r];
      if (a) { if (row.has(a)) return 'Dopplung Zeile ' + r; row.add(a); }
      if (b) { if (col.has(b)) return 'Dopplung Spalte ' + r; col.add(b); }
    }
  }
  // Straßen: lückenlose Folgen
  const lines = [];
  for (let r = 0; r < 9; r++) { lines.push([...Array(9)].map((_, c) => r * 9 + c)); lines.push([...Array(9)].map((_, c) => c * 9 + r)); }
  for (const line of lines) {
    let seg = [];
    for (const p of [...line, -1]) {
      if (p >= 0 && !black(mode[p])) { seg.push(s[p]); continue; }
      if (seg.length) {
        if (Math.max(...seg) - Math.min(...seg) !== seg.length - 1) return 'Keine Straße: ' + seg;
        seg = [];
      }
    }
  }
  for (let i = 0; i < 81; i++) if (!black(mode[i]) && !(s[i] >= 1 && s[i] <= 9)) return 'Leeres Feld ' + i;
  return null;
}

let fail = 0;
for (let d = 5; d >= 0; d--) {
  const times = [];
  for (let k = 0; k < N; k++) {
    const t = Date.now();
    const game = G.generate(d);
    times.push(Date.now() - t);
    const err = checkSolution(game);
    const code = G.encode(game);
    const back = G.decode(code);
    const puzzle = game.mode.map((m, i) => (m === G.USER ? 0 : game.solution[i]));
    const sols = G.countSolutions(game.mode, Uint8Array.from(puzzle), 2);
    const roundTrip = JSON.stringify(back) === JSON.stringify(game);
    if (err || sols !== 1 || !roundTrip || code.length !== 83) {
      fail++; log('FEHLER', d, err, 'Lösungen', sols, 'roundTrip', roundTrip, 'Länge', code.length);
    }
  }
  times.sort((a, b) => a - b);
  log(`Stufe ${d}: median ${times[times.length >> 1]} ms, max ${times[times.length - 1]} ms`);
}
log(fail ? `${fail} Fehler` : 'Alle Prüfungen bestanden');
if (isNode) process.exit(fail ? 1 : 0);
else if (fail) throw new Error('Tests fehlgeschlagen');
