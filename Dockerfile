FROM node:20-bookworm-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install gpu-cli
RUN curl -fsSL https://gpu-cli.sh | sh \
    && ln -s /root/.gpu-cli/bin/gpu /usr/local/bin/gpu

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Make scripts executable
RUN chmod +x /app/scripts/*.sh /app/scripts/*.js 2>/dev/null || true

# Create directories for uploads and jobs
RUN mkdir -p uploads jobs data

# Expose port
EXPOSE 3000

# Use startup script
CMD ["/app/scripts/start.sh"]
