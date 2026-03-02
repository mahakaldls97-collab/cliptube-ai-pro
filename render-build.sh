#!/usr/bin/env bash
# Exit on error
set -e

# Create bin directory
mkdir -p yt-dlp-bin

# Download LATEST yt-dlp Linux binary (this is critical for bypassing YouTube's latest blocks)
echo "Downloading latest yt-dlp engine..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp-bin/yt-dlp

# Set permissions
echo "Enabling engine permissions..."
chmod +x yt-dlp-bin/yt-dlp

# Install app dependencies
echo "Installing core dependencies..."
npm install
