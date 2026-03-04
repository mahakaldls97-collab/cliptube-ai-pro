# Hugging Face Docker Space - ClipTube AI Pro
FROM node:20-slim

# Install system dependencies: ffmpeg + python3 for yt-dlp
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp (latest version, most stable for YouTube)
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Verify installations
RUN yt-dlp --version && ffmpeg -version | head -1 && echo "All tools ready!"

# Set working directory
WORKDIR /app

# Copy package files first (for better Docker cache)
COPY package*.json ./
RUN npm install --production

# Copy all app files
COPY . .

# Create required directories
RUN mkdir -p temp output

# Hugging Face uses port 7860
ENV PORT=7860
ENV NODE_ENV=production

EXPOSE 7860

CMD ["node", "server/index.js"]
