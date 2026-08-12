#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cluster_name="atlas"
namespace="atlas-platform"

require() { command -v "$1" >/dev/null || { echo "$1 is required" >&2; exit 1; }; }

case "${action}" in
  create)
    require docker; require kind; require kubectl; require helm
    kind create cluster --name "${cluster_name}" --config "${root_dir}/deploy/kind/kind-config.yaml"
    helm upgrade --install envoy-gateway oci://docker.io/envoyproxy/gateway-helm --namespace envoy-gateway-system --create-namespace --wait --timeout 5m
    kubectl wait --timeout=5m -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available
    echo "Kind cluster created with an Envoy Gateway controller."
    ;;
  install)
    require docker; require kind; require kubectl; require helm
    cd "${root_dir}"
    npm run setup
    docker build -f apps/portal-shell/Dockerfile -t atlas/portal-shell:1.0.0 .
    docker build -f apps/extension-registry/Dockerfile -t atlas/extension-registry:1.0.0 .
    docker build -f services/inventory/Dockerfile -t atlas/inventory:1.0.0 .
    docker build -f services/audit/Dockerfile -t atlas/audit:1.0.0 .
    docker build -f services/github-webhooks/Dockerfile -t atlas/github-webhooks:1.0.0 .
    kind load docker-image --name "${cluster_name}" atlas/portal-shell:1.0.0 atlas/extension-registry:1.0.0 atlas/inventory:1.0.0 atlas/audit:1.0.0 atlas/github-webhooks:1.0.0
    set -a; source ./.env; set +a
    kubectl create namespace "${namespace}" --dry-run=client -o yaml | kubectl apply -f -
    kubectl -n "${namespace}" create secret generic atlas-platform-secrets \
      --from-literal=SESSION_KEY="${SESSION_KEY}" \
      --from-literal=DEV_JWT_SECRET="${DEV_JWT_SECRET}" \
      --from-literal=REGISTRY_API_TOKEN="${REGISTRY_API_TOKEN}" \
      --from-literal=OIDC_CLIENT_SECRET="development-not-used" \
      --from-literal=DATABASE_URL="postgresql://atlas:atlas-dev-only@github-webhooks-postgres:5432/atlas" \
      --from-literal=AMQP_URL="amqp://atlas:atlas-dev-only@github-webhooks-rabbitmq:5672" \
      --from-literal=GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET}" \
      --dry-run=client -o yaml | kubectl apply -f -
    kubectl apply -f "${root_dir}/deploy/kind/github-webhooks-dependencies.yaml"
    kubectl -n "${namespace}" rollout status deployment/github-webhooks-postgres deployment/github-webhooks-rabbitmq --timeout=5m
    "${root_dir}/scripts/install-platform.sh" dev
    echo "Run scripts/port-forward.sh, then open http://localhost:8080"
    ;;
  delete)
    require kind
    kind delete cluster --name "${cluster_name}"
    ;;
  *)
    echo "Usage: scripts/kind.sh <create|install|delete>" >&2
    exit 2
    ;;
esac
