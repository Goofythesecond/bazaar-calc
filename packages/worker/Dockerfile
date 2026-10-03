FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @bc/shared build && pnpm --filter @bc/server-core build && pnpm --filter @bc/worker build

FROM node:24-slim
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
CMD ["node", "packages/worker/dist/index.js"]
