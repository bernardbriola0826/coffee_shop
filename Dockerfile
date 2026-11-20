FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
FROM node:20-bookworm-slim
ENV NODE_ENV=production DB_PATH=/data/den.db
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package*.json server.js ./
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node","server.js"]
