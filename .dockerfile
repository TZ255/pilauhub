# Use Node 22 slim as base
FROM node:22-slim

# Install system dependencies including mkvtoolnix
RUN apt-get update && \
    apt-get install -y mkvtoolnix ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Define volumes (optional hint, Coolify will mount actual volumes)
VOLUME ["/app/storage", "/app/private", "/app/public"]

# Expose app port (optional, depending on your app)
EXPOSE 3000

# Start your app
CMD ["npm", "start"]