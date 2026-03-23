FROM node:22-bookworm-slim

WORKDIR /app

COPY backend ./backend
COPY app/www ./app/www
COPY README.md ./README.md

ENV PORT=8787
EXPOSE 8787

CMD ["node", "backend/server.js"]
