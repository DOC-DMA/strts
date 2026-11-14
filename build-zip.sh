#!/bin/sh
# Baut strts-upload.zip für den Upload auf den Webspace.
# Liegt impressum.privat.html vor (ausgefüllt, nicht im Repository), kommt sie als impressum.html in die Zip.
set -e
cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R index.html impressum.html manifest.webmanifest LICENSE css js img "$tmp/"
if [ -f impressum.privat.html ]; then
  cp impressum.privat.html "$tmp/impressum.html"
fi
find "$tmp" -name .DS_Store -delete
if grep -q "<mark>" "$tmp/impressum.html"; then
  echo "Abbruch: impressum.html enthält noch Platzhalter. Ausgefüllte Fassung als impressum.privat.html ablegen." >&2
  exit 1
fi
rm -f strts-upload.zip
(cd "$tmp" && zip -r -X -q "$OLDPWD/strts-upload.zip" .)
echo "strts-upload.zip erstellt:"
unzip -l strts-upload.zip | tail -1
