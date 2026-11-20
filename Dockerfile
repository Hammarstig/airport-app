# Gatelog - produktionsavbild (används av Railway, fungerar med vanlig Docker)
FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g npm@11
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
EXPOSE 8787
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.js"]
