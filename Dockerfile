FROM node:22-bookworm-slim

WORKDIR /app

COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --omit=dev

COPY backend ./backend
COPY app/www ./app/www
COPY README.md ./README.md

ENV PORT=8787
EXPOSE 8787

CMD ["node", "backend/server.js"]
