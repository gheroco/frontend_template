# syntax=docker/dockerfile:1.7
FROM node:24.14.0-alpine3.23@sha256:7fddd9ddeae8196abf4a3ef2de34e11f7b1a722119f91f28ddf1e99dcafdf114 AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/service-kit/package.json packages/service-kit/package.json
COPY apps/extension-registry/package.json apps/extension-registry/package.json
COPY services/inventory/package.json services/inventory/package.json
COPY services/audit/package.json services/audit/package.json
COPY apps/portal-shell/package.json apps/portal-shell/package.json
RUN npm ci --ignore-scripts
COPY packages/contracts packages/contracts
COPY packages/service-kit packages/service-kit
COPY services/inventory services/inventory
RUN npm run build -w @atlas/contracts && npm run build -w @atlas/service-kit && npm run build -w @atlas/inventory-service && npm prune --omit=dev

FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime
ENV NODE_ENV=production PORT=4201
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /workspace/packages ./packages
COPY --from=build --chown=10001:10001 /workspace/services/inventory ./services/inventory
USER 10001:10001
EXPOSE 4201
CMD ["services/inventory/dist/server/index.js"]
