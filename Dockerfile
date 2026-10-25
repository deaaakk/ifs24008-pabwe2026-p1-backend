FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
ENV PORT=3000
ENV DB_PATH=/data/reservasi.db
ENV COOKIE_SECURE=true
RUN mkdir -p /data
EXPOSE 3000
CMD ["bun", "src/index.js"]
