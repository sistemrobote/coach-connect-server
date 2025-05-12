#!/bin/bash
set -e

# Absolute path to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Assume your Node.js app is one level above the terraform/ folder
APP_DIR="$SCRIPT_DIR/.."
ZIP_OUT="$SCRIPT_DIR/function.zip"

# Move to app dir and zip code
cd "$APP_DIR"
rm -f "$ZIP_OUT"
npm install --omit=dev > /dev/null 2>&1
zip -r "$ZIP_OUT" handler.js app.js node_modules > /dev/null

# Output JSON only
echo "{\"zip_path\": \"$ZIP_OUT\"}"
