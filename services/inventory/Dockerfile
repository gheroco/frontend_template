# syntax=docker/dockerfile:1.7
FROM node:24.14.0-alpine3.23 AS build
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

FROM node:24.14.0-alpine3.23 AS runtime
ENV NODE_ENV=production PORT=4201
WORKDIR /app
RUN addgroup -S -g 10001 atlas && adduser -S -D -H -u 10001 -G atlas atlas
COPY --from=build --chown=atlas:atlas /workspace/node_modules ./node_modules
COPY --from=build --chown=atlas:atlas /workspace/packages ./packages
COPY --from=build --chown=atlas:atlas /workspace/services/inventory ./services/inventory
USER 10001:10001
EXPOSE 4201
CMD ["node", "services/inventory/dist/server/index.js"]
