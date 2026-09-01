# syntax=docker/dockerfile:1.7
FROM node:26.8.1-alpine3.23@sha256:871eb674ad6e692c91330a8959f1ce2f80ba3f445cdc54e306869d2ea265e42d AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/service-kit/package.json packages/service-kit/package.json
COPY apps/extension-registry/package.json apps/extension-registry/package.json
COPY services/inventory/package.json services/inventory/package.json
COPY services/audit/package.json services/audit/package.json
COPY services/github-webhooks/package.json services/github-webhooks/package.json
COPY apps/portal-shell/package.json apps/portal-shell/package.json
RUN npm ci --ignore-scripts
COPY packages/contracts packages/contracts
COPY packages/service-kit packages/service-kit
COPY services/audit services/audit
RUN npm run build -w @atlas/contracts && npm run build -w @atlas/service-kit && npm run build -w @atlas/audit-service && npm prune --omit=dev

FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime
ENV NODE_ENV=production PORT=4202
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /workspace/packages ./packages
COPY --from=build --chown=10001:10001 /workspace/services/audit ./services/audit
USER 10001:10001
EXPOSE 4202
CMD ["services/audit/dist/server/index.js"]
