# FVButtonRelay Dockerfile
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (leverage layer caching)
COPY package*.json ./
RUN npm ci --only=production || npm install --only=production

# Bundle app source
COPY . .

# Environment
ENV NODE_ENV=production \
    PORT=4020 \
    FEEDS_PORT=4021

# Expose ports
EXPOSE 4020 4021

# Start
CMD ["node", "server.js"]
