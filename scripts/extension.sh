#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"
namespace="${ATLAS_NAMESPACE:-atlas-platform}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chart="${root_dir}/services/inventory/deploy/chart"
values="${root_dir}/deploy/environments/${ATLAS_ENVIRONMENT:-dev}/inventory.yaml"

case "${action}" in
  suppliers)
    helm upgrade atlas-inventory "${chart}" -n "${namespace}" -f "${values}" --reuse-values --set portalRegistration.suppliersTab=true --atomic --wait
    ;;
  upgrade)
    : "${INVENTORY_IMAGE_TAG:?Set INVENTORY_IMAGE_TAG to the immutable release tag}"
    : "${INVENTORY_SRI:?Set INVENTORY_SRI to the release SHA-384 SRI value}"
    helm upgrade atlas-inventory "${chart}" -n "${namespace}" -f "${values}" --reuse-values \
      --set-string image.tag="${INVENTORY_IMAGE_TAG}" \
      --set-string portalRegistration.serviceVersion="${INVENTORY_IMAGE_TAG}" \
      --set-string portalRegistration.extensionVersion="${INVENTORY_IMAGE_TAG}" \
      --set portalRegistration.elementName=inventory-overview-v2 \
      --set-string portalRegistration.integrity="${INVENTORY_SRI}" --atomic --cleanup-on-fail --wait
    ;;
  rollback)
    helm rollback atlas-inventory "${2:-0}" -n "${namespace}" --wait
    ;;
  disable)
    helm upgrade atlas-inventory "${chart}" -n "${namespace}" --reuse-values --set portalRegistration.enabled=false --atomic --wait
    ;;
  enable)
    helm upgrade atlas-inventory "${chart}" -n "${namespace}" --reuse-values --set portalRegistration.enabled=true --atomic --wait
    ;;
  delete|unregister)
    kubectl -n "${namespace}" delete portalservice inventory --ignore-not-found
    ;;
  register)
    helm upgrade atlas-inventory "${chart}" -n "${namespace}" -f "${values}" --reuse-values --set portalRegistration.create=true --atomic --wait
    ;;
  *)
    echo "Usage: scripts/extension.sh <suppliers|upgrade|rollback [revision]|disable|enable|delete|register>" >&2
    exit 2
    ;;
esac
