/*
 * strts – Generator für Zahlenstraßen-Rätsel (JavaScript)
 *
 * Copyright (C) 2021–2023 Luis Walter (daandtu)
 *   Original-Generator in C++: https://github.com/daandtu/Str8ts
 * Copyright (C) 2026 5C
 *   Portierung nach JavaScript und Änderungen: https://github.com/DOC-DMA/strts
 *
 * Geändert am 13.11.2026 gegenüber dem Original:
 *   - von C++ nach JavaScript portiert, läuft im Browser (Web Worker) statt per PHP/exec
 *   - Endlosschleife beim Setzen der schwarzen Zahlenfelder behoben (|| -> &&)
 *   - Neustart beim Entfernen von Zahlen arbeitet nicht mehr mit veraltetem Spielfeld weiter
 *   - Lösungszähler bricht nach der zweiten Lösung ab und wählt das Feld mit den
 *     wenigsten Kandidaten zuerst (deutlich schneller, gleiches Ergebnis)
 *   - Zahlen für schwarze Felder werden zufällig statt aufsteigend gewählt
 *   - Neustarts als Schleife statt Rekursion
 *
 * Das Kodierungsformat (Version 2, base64url) ist mit dem Original kompatibel.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
(function (root) {
  'use strict';

  const USER = 0, KNOWN = 1, BLACK = 2, BLACKKNOWN = 3;
  const MAX_CREATE_STEPS = 300000;
  const MAX_SOLVE_STEPS = 200000;
  const FIND_KNOWN_BLACK_RETRIES = 2000;
  const MAX_ATTEMPTS = 20000;
  const ENCODING_VERSION = 2;
  const BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  const isBlack = (m) => m >= BLACK;

  function randInt(start, end) {
    return start + Math.floor(Math.random() * (end - start + 1));
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /**
   * Darf `n` an Position `pos` stehen? Keine Dopplung in Zeile/Spalte und die Zahlen
   * jeder Straße (weiße Felder zwischen schwarzen) müssen noch lückenlos passen.
   * Voraussetzung: num[pos] === 0.
   */
  function isAllowed(pos, n, mode, num) {
    const row = (pos / 9) | 0, col = pos % 9;
    for (let i = 0; i < 9; i++) {
      if (num[row * 9 + i] === n || num[i * 9 + col] === n) return false;
    }
    let min = n, max = n, a = pos, b = pos, v;
    while (a % 9 > 0 && !isBlack(mode[a - 1])) {
      a--; v = num[a];
      if (v) { if (v < min) min = v; if (v > max) max = v; }
    }
    while (b % 9 < 8 && !isBlack(mode[b + 1])) {
      b++; v = num[b];
      if (v) { if (v < min) min = v; if (v > max) max = v; }
    }
    if (max - min > b - a) return false;

    min = n; max = n; a = pos; b = pos;
    while (a > 8 && !isBlack(mode[a - 9])) {
      a -= 9; v = num[a];
      if (v) { if (v < min) min = v; if (v > max) max = v; }
    }
    while (b < 72 && !isBlack(mode[b + 9])) {
      b += 9; v = num[b];
      if (v) { if (v < min) min = v; if (v > max) max = v; }
    }
    return max - min <= (b - a) / 9;
  }

  /** Prüft die Verteilung der schwarzen Felder (Logik wie im Original). */
  function blackPatternOk(mode) {
    const B = (r, c) => isBlack(mode[r * 9 + c]);
    for (let row = 0; row < 9; row++) {
      let singleRow = 0, singleCol = 0;
      for (let col = 0; col < 9; col++) {
        let vert = 0, horiz = 0, diag = 0;
        const border = (row === 0 || col === 0 || row === 8 || col === 8) ? 1 : 0;
        if (row > 0 && B(row - 1, col)) vert++;
        if (row < 8 && B(row + 1, col)) vert++;
        if (col > 0 && B(row, col - 1)) horiz++;
        if (col < 8 && B(row, col + 1)) horiz++;
        if (row > 0 && col > 0 && B(row - 1, col - 1)) diag++;
        if (row > 0 && col < 8 && B(row - 1, col + 1)) diag++;
        if (row < 8 && col > 0 && B(row + 1, col - 1)) diag++;
        if (row < 8 && col < 8 && B(row + 1, col + 1)) diag++;
        if (vert > 1) singleRow++;
        if (horiz > 1) singleCol++;
        if (vert + horiz + diag + border > 3) return false;
      }
      if (singleCol > 1 || singleRow > 1) return false;
    }
    return true;
  }

  /** Füllt alle weißen Felder per Backtracking mit zufälligen gültigen Zahlen. */
  function fillNumbers(mode, num) {
    let steps = 0;
    const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    function rec(pos) {
      if (pos === 81) return true;
      if (++steps > MAX_CREATE_STEPS) return false;
      if (isBlack(mode[pos])) return rec(pos + 1);
      const digits = shuffled(DIGITS);
      for (let i = 0; i < 9; i++) {
        if (isAllowed(pos, digits[i], mode, num)) {
          num[pos] = digits[i];
          if (rec(pos + 1)) return true;
          num[pos] = 0;
          if (steps > MAX_CREATE_STEPS) return false;
        }
      }
      return false;
    }
    return rec(0);
  }

  /**
   * Zählt Lösungen bis `limit`. Gibt -1 zurück, wenn das Schrittlimit erreicht wurde.
   * `num` wird verändert und am Ende wiederhergestellt.
   */
  function countSolutions(mode, num, limit) {
    limit = limit || 2;
    const empties = [];
    for (let i = 0; i < 81; i++) if (!isBlack(mode[i]) && num[i] === 0) empties.push(i);
    let steps = 0, aborted = false;

    function rec() {
      if (++steps > MAX_SOLVE_STEPS) { aborted = true; return 0; }
      let best = -1, bestMask = 0, bestCount = 10;
      for (let k = 0; k < empties.length; k++) {
        const p = empties[k];
        if (num[p] !== 0) continue;
        let mask = 0, count = 0;
        for (let n = 1; n <= 9; n++) {
          if (isAllowed(p, n, mode, num)) { mask |= 1 << n; count++; }
        }
        if (count === 0) return 0;
        if (count < bestCount) {
          best = p; bestMask = mask; bestCount = count;
          if (count === 1) break;
        }
      }
      if (best === -1) return 1;
      let total = 0;
      for (let n = 1; n <= 9; n++) {
        if (!(bestMask & (1 << n))) continue;
        num[best] = n;
        total += rec();
        num[best] = 0;
        if (total >= limit || aborted) break;
      }
      return total;
    }
    const result = rec();
    return aborted ? -1 : result;
  }

  /** Ein Generierungsversuch. Gibt null zurück, wenn neu begonnen werden muss. */
  function tryGenerate(difficulty) {
    const mode = new Uint8Array(81);
    const num = new Uint8Array(81);

    // Schwarze Felder setzen
    const totalBlack = 20 + randInt(0, 3 + difficulty);
    const symmetric = randInt(0, 1) === 1;
    let blackCount = 0;
    while (blackCount < totalBlack) {
      const pos = randInt(0, 80);
      if (mode[pos] === BLACK) continue;
      mode[pos] = BLACK; blackCount++;
      if (symmetric && 80 - pos !== pos && mode[80 - pos] !== BLACK) {
        mode[80 - pos] = BLACK; blackCount++;
      }
    }
    if (!blackPatternOk(mode)) return null;

    // Weiße Felder füllen
    if (!fillNumbers(mode, num)) return null;

    // Einige schwarze Felder mit Zahlen versehen
    const maxKnownBlack = 4 + randInt(0, 3);
    let knownBlack = 0, retries = 0;
    while (knownBlack < maxKnownBlack && retries < FIND_KNOWN_BLACK_RETRIES) {
      retries++;
      const i = randInt(0, 80);
      if (mode[i] !== BLACK) continue;
      const row = (i / 9) | 0, col = i % 9;
      const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const n of digits) {
        let exists = false;
        for (let s = 0; s < 9; s++) {
          if (num[row * 9 + s] === n || num[s * 9 + col] === n) { exists = true; break; }
        }
        if (!exists) { mode[i] = BLACKKNOWN; num[i] = n; knownBlack++; break; }
      }
    }

    // Zahlen entfernen, solange die Lösung eindeutig bleibt
    const toRemove = Math.min(50, 81 - blackCount - (difficulty + 2) * 3);
    const puzzle = Uint8Array.from(num);
    let removed = 0;
    while (removed < toRemove) {
      const start = randInt(0, 80);
      let ok = false;
      for (let j = 0; j < 81; j++) {
        const p = (start + j) % 81;
        if (mode[p] !== USER || puzzle[p] === 0) continue;
        const keep = puzzle[p];
        puzzle[p] = 0;
        if (countSolutions(mode, puzzle, 2) === 1) { removed++; ok = true; break; }
        puzzle[p] = keep;
      }
      if (!ok) return null;
    }

    for (let i = 0; i < 81; i++) {
      if (mode[i] === USER && puzzle[i] > 0) mode[i] = KNOWN;
    }
    return { mode: Array.from(mode), solution: Array.from(num) };
  }

  /**
   * Erzeugt ein neues Rätsel.
   * @param {number} difficulty 0 (am schwersten) bis 5 (am leichtesten), wie im Original
   * @returns {{mode:number[], solution:number[]}}
   */
  function generate(difficulty) {
    difficulty = Math.max(0, Math.min(5, difficulty | 0));
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const game = tryGenerate(difficulty);
      if (game) return game;
    }
    throw new Error('Rätsel konnte nicht erzeugt werden');
  }

  /** Kodiert ein Spiel als base64url-String (Format Version 2, kompatibel mit dem Original). */
  function encode(game) {
    let bits = ENCODING_VERSION.toString(2).padStart(8, '0');
    for (let i = 0; i < 81; i++) {
      bits += game.mode[i].toString(2).padStart(2, '0');
      bits += Math.max(0, game.solution[i] - 1).toString(2).padStart(4, '0');
    }
    let out = '';
    for (let i = 0; i < bits.length; i += 6) {
      out += BASE[parseInt(bits.substr(i, 6).padEnd(6, '0'), 2)];
    }
    return out;
  }

  /** Dekodiert einen Spiel-String. Gibt null zurück, wenn er ungültig ist. */
  function decode(code) {
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
    let bits = '';
    for (const ch of code) bits += BASE.indexOf(ch).toString(2).padStart(6, '0');
    const version = parseInt(bits.substr(0, 8), 2);
    bits = bits.substr(8);
    if (version !== ENCODING_VERSION || bits.length < 6 * 81) return null;
    const mode = [], solution = [];
    for (let i = 0; i < 81; i++) {
      const cell = bits.substr(i * 6, 6);
      const m = parseInt(cell.substr(0, 2), 2);
      const v = parseInt(cell.substr(2, 4), 2) + 1;
      if (v > 9) return null;
      mode.push(m);
      solution.push(m === BLACK ? 0 : v);
    }
    return { mode, solution };
  }

  const api = { USER, KNOWN, BLACK, BLACKKNOWN, generate, encode, decode, isAllowed, countSolutions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StrtsGenerator = api;
})(typeof self !== 'undefined' ? self : this);
