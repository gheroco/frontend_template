# Security policy

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting for this repository.

Supported releases are the current minor version and the immediately preceding production rollback version. Security fixes may require coordinated rotation of images, SRI metadata, and Helm values, but never a shell rebuild for a service-only issue.

Never commit `.env`, Kubernetes Secrets, OIDC client secrets, session keys, registry tokens, kubeconfigs, signing keys, or production host data. CI uses GitHub OIDC for keyless provenance/signing and environment-scoped deployment secrets.

