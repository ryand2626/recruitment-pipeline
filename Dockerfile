FROM node:18-alpine

# Create app directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# Install system dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    postgresql-client

# Skip Chromium download during Playwright installation
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose ports (if needed)
EXPOSE 3000

# Set entry point with default command
ENTRYPOINT ["node"]

# Default command runs the worker script
CMD ["index.js"]
