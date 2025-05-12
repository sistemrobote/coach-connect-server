#!/bin/bash

set -e
set -o pipefail

# Constants
ZIP_FILE="lambda.zip"
ZIP_PATH="$(pwd)/$ZIP_FILE"
ROOT_DIR="$(dirname "$(pwd)")"  # Assumes this script runs from terraform/

# Clean up any existing ZIP
[ -f "$ZIP_FILE" ] && rm "$ZIP_FILE"

# Validate required files
if [ ! -f "$ROOT_DIR/handler.js" ]; then
  echo "❌ Error: handler.js not found in $ROOT_DIR" >&2
  exit 1
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "❌ Error: node_modules not found in $ROOT_DIR" >&2
  exit 1
fi

# Build ZIP from repo root (handler.js + node_modules)
zip -r "$ZIP_FILE" ../handler.js ../node_modules > /dev/null

# Output only JSON for Terraform
echo "{\"zip_path\": \"$(pwd)/$ZIP_FILE\"}"
