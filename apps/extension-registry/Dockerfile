# syntax=docker/dockerfile:1.7
FROM node:26.10.0-alpine3.23@sha256:c3c6e314fd42e41962360b2482fc18d150beb47976c3aa7b8b9689d7ef42a5c2 AS build
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
COPY apps/extension-registry apps/extension-registry
RUN npm run build -w @atlas/contracts && npm run build -w @atlas/service-kit && npm run build -w @atlas/extension-registry && npm prune --omit=dev

FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime
ENV NODE_ENV=production PORT=4100
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /workspace/packages ./packages
COPY --from=build --chown=10001:10001 /workspace/apps/extension-registry ./apps/extension-registry
USER 10001:10001
EXPOSE 4100
CMD ["apps/extension-registry/dist/index.js"]
