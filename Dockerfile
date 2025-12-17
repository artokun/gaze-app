FROM ubuntu:24.04

# Set USER env var for gpu-cli (it uses this for project detection)
ENV USER=gaze-app

WORKDIR /app

# Install system dependencies and Node.js
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    openssh-client \
    gnupg \
    git \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install gpu-cli
RUN curl -fsSL https://gpu-cli.sh | sh \
    && ln -s /root/.gpu-cli/bin/gpu /usr/local/bin/gpu

# Copy package files
COPY package*.json ./

# Install ALL dependencies (tsx needed for server.ts)
RUN npm ci

# Copy application code
COPY . .

# Build Next.js for production
RUN npm run build

# Initialize git repo for .gitignore to be respected by gpu-cli sync
RUN git init && git config user.email "docker@local" && git config user.name "Docker"

# Make scripts executable
RUN chmod +x /app/scripts/*.sh /app/scripts/*.js 2>/dev/null || true

# Create directories for uploads and jobs
RUN mkdir -p uploads jobs data

# Expose port
EXPOSE 3000

# Use startup script
CMD ["/app/scripts/start.sh"]
