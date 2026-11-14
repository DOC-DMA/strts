/* strts – Web Worker: erzeugt Rätsel im Hintergrund, damit die Seite flüssig bleibt.
 * Copyright (C) 2026 5C – GPL-3.0, siehe LICENSE */
importScripts('generator.js');
self.onmessage = (e) => {
  try {
    const game = self.StrtsGenerator.generate(e.data.difficulty);
    self.postMessage({ id: e.data.id, code: self.StrtsGenerator.encode(game) });
  } catch (err) {
    self.postMessage({ id: e.data.id, error: String(err && err.message || err) });
  }
};
