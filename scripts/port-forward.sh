#!/usr/bin/env bash
set -euo pipefail
namespace="${ATLAS_NAMESPACE:-atlas-platform}"
gateway_namespace="${GATEWAY_NAMESPACE:-envoy-gateway-system}"
service_name="$(kubectl -n "${gateway_namespace}" get service -l gateway.envoyproxy.io/owning-gateway-name=atlas-gateway -o jsonpath='{.items[0].metadata.name}')"
test -n "${service_name}" || { echo "Envoy data-plane service was not found" >&2; exit 1; }
exec kubectl -n "${gateway_namespace}" port-forward "service/${service_name}" 8080:80

