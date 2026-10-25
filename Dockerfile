# Omaville as one container (Coolify, or any Docker host): the SvelteKit app with the relay inside. It needs a
# Postgres at DATABASE_URL (migrations apply as it starts) and the variables in .env.example; it listens on PORT
# (3000) and answers /status for health checks.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# migrations and the city's one config file (the city's data lives in the database)
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/city.config.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "build"]
