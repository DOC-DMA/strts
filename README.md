# strts – Zahlenstraßen

Ein Zahlenrätsel für den Browser: unbegrenzt neue Rätsel in sechs Schwierigkeitsstufen (Sehr leicht bis Ultra), spielbar auf iPhone, iPad und am Rechner mit Tastatur.

Die Seite besteht nur aus statischen Dateien. Der Rätselgenerator läuft im Browser, es wird weder PHP noch eine Datenbank gebraucht.

## Herkunft und Lizenz

strts basiert auf dem Projekt **[Str8ts](https://github.com/daandtu/Str8ts)** von Luis Walter (daandtu), veröffentlicht unter der GNU General Public License v3.0.

- Copyright © 2021–2023 Luis Walter – Original (Generator in C++, Weboberfläche)
- Copyright © 2026 5C – Portierung und Neugestaltung

strts ist ein abgeleitetes Werk und steht deshalb ebenfalls unter der **GNU General Public License v3.0**, siehe [LICENSE](LICENSE). Das Programm wird ohne jegliche Gewährleistung bereitgestellt. Wer die Seite weitergibt oder verändert veröffentlicht, muss den Quellcode unter derselben Lizenz zugänglich machen und diese Hinweise erhalten.

Str8ts® ist eine eingetragene Marke von Syndicated Puzzles Inc. Dieses Projekt steht damit in keiner Verbindung.

### Änderungen gegenüber dem Original (Stand 13.11.2026)

- Generator von C++ nach JavaScript portiert ([js/generator.js](js/generator.js)); er läuft in einem Web Worker im Browser statt per PHP auf dem Server.
- Drei Fehler im Generator behoben: mögliche Endlosschleife beim Setzen der schwarzen Zahlenfelder, Weiterrechnen mit veraltetem Spielfeld nach einem Neustart, Lösungszähler ohne Abbruch nach der zweiten Lösung.
- Oberfläche neu geschrieben, ohne jQuery und ohne externe Schriften oder Skripte: Tastaturbedienung, Umschalter Normal/Notizen, Darstellung für Smartphone und Tablet, heller und dunkler Modus.
- Der Spielstand wird im Browser gespeichert und übersteht ein Neuladen.
- PHP-Skript und C++-Quelltext sind entfallen.

Das Format der Rätsel-Links (`?code=…`, Kodierung Version 2) ist mit dem Original kompatibel.

## Regeln

- Alle weißen Felder werden mit Zahlen von 1 bis 9 gefüllt.
- In jeder Zeile und Spalte kommt jede Zahl höchstens einmal vor. Zahlen in schwarzen Feldern zählen mit.
- Schwarze Felder teilen Zeilen und Spalten in Straßen. Jede Straße besteht aus lückenlos aufeinanderfolgenden Zahlen in beliebiger Reihenfolge.

## Bedienung

| Taste | Wirkung |
|---|---|
| `1`–`9` | Zahl eintragen, mit Umschalttaste als Notiz |
| Pfeiltasten | Feld wechseln |
| `Tab` / `Enter` | nächstes freies Feld, mit Umschalttaste zurück |
| `Entf` / `Rücktaste` / `0` | Feld leeren |
| `M` / `N` | zwischen Normal und Notizen wechseln |
| `Strg`/`⌘` + `Z` oder `U` | Rückgängig |
| `Esc` | Auswahl aufheben |

## Dateien

| Pfad | Inhalt |
|---|---|
| `index.html` | Seite |
| `impressum.html` | Impressum, Datenschutz, Lizenzhinweise |
| `css/style.css` | Gestaltung |
| `js/generator.js` | Rätselgenerator, Kodierung |
| `js/worker.js` | Web Worker für den Generator |
| `js/app.js` | Spieloberfläche |
| `img/` | 5C-Logo und App-Symbole |
| `manifest.webmanifest` | Angaben für „Zum Home-Bildschirm“ |
| `test/generator.test.js` | Test des Generators |

## Veröffentlichen

```sh
./build-zip.sh
```

Das Skript packt `index.html`, `impressum.html`, `manifest.webmanifest`, `LICENSE`, `css/`, `js/` und `img/` in `strts-upload.zip`. Den Inhalt der Zip in das Verzeichnis der Domain hochladen.

Die `impressum.html` im Repository enthält Platzhalter statt Name und Anschrift. Die ausgefüllte Fassung liegt lokal als `impressum.privat.html` (nicht im Repository); das Skript nimmt sie, wenn sie vorhanden ist, und legt sie als `impressum.html` in die Zip. Wer Datenschutztexte ändert, muss beide Dateien anpassen.

## Lokal ausprobieren und testen

```sh
python3 -m http.server 8000      # dann http://localhost:8000 öffnen
node test/generator.test.js 20   # 20 Rätsel je Stufe erzeugen und prüfen
```

Ohne Node funktioniert der Test auf macOS auch mit der eingebauten JavaScript-Laufzeit:

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc \
  -e "load('js/generator.js')" test/generator.test.js -- 20
```
