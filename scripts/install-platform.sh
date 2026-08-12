#!/usr/bin/env bash
set -euo pipefail

environment_name="${1:-dev}"
namespace="${ATLAS_NAMESPACE:-atlas-platform}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
values_dir="${root_dir}/deploy/environments/${environment_name}"

for command_name in kubectl helm; do
  command -v "${command_name}" >/dev/null || { echo "${command_name} is required" >&2; exit 1; }
done
test -d "${values_dir}" || { echo "Unknown environment: ${environment_name}" >&2; exit 2; }

helm upgrade --install atlas-foundation "${root_dir}/deploy/charts/platform" --namespace "${namespace}" --create-namespace --values "${values_dir}/platform.yaml" --atomic --wait --timeout 5m
helm upgrade --install atlas-registry "${root_dir}/deploy/charts/extension-registry" --namespace "${namespace}" --values "${values_dir}/registry.yaml" --atomic --wait --timeout 5m
helm upgrade --install atlas-portal "${root_dir}/deploy/charts/portal-shell" --namespace "${namespace}" --values "${values_dir}/portal-shell.yaml" --atomic --wait --timeout 5m
helm upgrade --install atlas-inventory "${root_dir}/services/inventory/deploy/chart" --namespace "${namespace}" --values "${values_dir}/inventory.yaml" --atomic --wait --timeout 5m
helm upgrade --install atlas-audit "${root_dir}/services/audit/deploy/chart" --namespace "${namespace}" --values "${values_dir}/audit.yaml" --atomic --wait --timeout 5m
helm upgrade --install atlas-github-webhooks "${root_dir}/services/github-webhooks/deploy/chart" --namespace "${namespace}" --values "${values_dir}/github-webhooks.yaml" --atomic --wait --timeout 5m

kubectl wait --namespace "${namespace}" --for=condition=Programmed gateway/atlas-gateway --timeout=180s
echo "Atlas ${environment_name} installed as six independent Helm releases in ${namespace}."

