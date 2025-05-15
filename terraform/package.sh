#!/bin/bash

set -e
set -o pipefail

ZIP_FILE="lambda.zip"

# Clean up old zip
rm -f "$ZIP_FILE"

# Check that expected files exist
[ -f "../handler.js" ] || { echo "❌ handler.js is missing"; exit 1; }
[ -d "../node_modules" ] || { echo "❌ node_modules is missing"; exit 1; }

# Create ZIP from project root (one level up)
cd ..
zip -r terraform/$ZIP_FILE handler.js server.js secrets.js users.js node_modules > /dev/null
cd terraform

# Output JSON for Terraform
echo "{\"zip_path\": \"$(pwd)/$ZIP_FILE\"}"
