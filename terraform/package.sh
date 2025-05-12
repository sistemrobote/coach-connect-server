#!/bin/bash

set -e  # Exit on error
set -o pipefail

# Define the zip file path
ZIP_FILE="lambda.zip"

# Clean up any previous zip file
if [ -f "$ZIP_FILE" ]; then
  echo "Removing existing $ZIP_FILE..." >&2
  rm "$ZIP_FILE"
fi

# Ensure handler and node_modules exist
if [ ! -f "../handler.js" ]; then
  echo "❌ Error: handler.js not found in project root"
  exit 1
fi

if [ ! -d "../node_modules" ]; then
  echo "❌ Error: node_modules directory not found in project root"
  exit 1
fi

# Navigate to project root, zip the Lambda function files
cd ..
zip -r "terraform/$ZIP_FILE" handler.js node_modules > /dev/null

# Navigate back to terraform folder
cd terraform

# Output result for Terraform
echo "{\"zip_path\": \"$(pwd)/$ZIP_FILE\"}" 1>&1
