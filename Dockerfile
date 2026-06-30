FROM node:18-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json* ./
RUN npm install --production=false

# Copy application source
COPY . .

# Create output directory
RUN mkdir -p /app/output

EXPOSE 8080

CMD ["node", "src/index.js"]
