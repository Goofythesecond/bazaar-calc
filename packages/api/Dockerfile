# Builds the API and the website into one image (the API serves the site).
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @bc/shared build && pnpm --filter @bc/server-core build && pnpm --filter @bc/api build && pnpm --filter @bc/web build

FROM node:24-slim
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production WEB_DIST=/app/packages/web/dist
EXPOSE 8787
CMD ["node", "packages/api/dist/index.js"]
