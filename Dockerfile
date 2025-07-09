FROM oven/bun:alpine

WORKDIR /app

# Create data directory for persistent storage
RUN mkdir -p /data

COPY package.json ./
COPY bun.lock* ./

RUN bun install

COPY . .

CMD ["bun", "run", "index.ts"]