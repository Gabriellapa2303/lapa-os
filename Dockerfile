FROM node:20-alpine
WORKDIR /app
ENV TZ=America/Sao_Paulo
ENV APP_TIMEZONE=America/Sao_Paulo
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY database/ ./database/
COPY scripts/ ./scripts/
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/index.js"]
