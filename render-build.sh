#!/usr/bin/env bash

# Exit on error
set -e

# Create bin directory
mkdir -p yt-dlp-bin

# Download yt-dlp Linux binary
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp-bin/yt-dlp

# Set permissions
echo "Setting permissions for yt-dlp..."
chmod +x yt-dlp-bin/yt-dlp
ls -la yt-dlp-bin/yt-dlp

# Install app dependencies
echo "Installing npm dependencies..."
npm install
