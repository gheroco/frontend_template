# VV8 home · Render deployment

Deployment configuration for the completed 3.00 m ceiling viewer in the `frontend_template` monorepo. This document records the source and deployment settings; it does not assert deployment completion or provide a live URL.

## Source

- Repository: [gheroco/frontend_template](https://github.com/gheroco/frontend_template)
- Branch: `apps/vv8-home`
- App directory: `apps/vv8-home/`
- Optional Blueprint file: `apps/vv8-home/render.yaml`

## Configuration

Direct service creation uses paths relative to the repository root. The optional Blueprint sets `rootDir`, so its build command and publish path are relative to the app directory.

| Setting | Direct Render service creation | Optional Blueprint |
| --- | --- | --- |
| Service name | `vv8-home-3m` | `vv8-home-3m` |
| Service type | Static Site | `type: web`, `runtime: static` |
| Root directory | Repository root; leave unset | `apps/vv8-home` |
| Build command | `test -f apps/vv8-home/dist/index.html` | `test -f dist/index.html` |
| Publish directory | `apps/vv8-home/dist` | `dist` |
| Dependency installation | `SKIP_INSTALL_DEPS=true` | `SKIP_INSTALL_DEPS=true` |
| Automatic deployments | No (`autoDeploy: "no"`) | `autoDeployTrigger: "off"` |

Use the repository and branch listed above for direct creation. For a Blueprint, select that same repository and branch and set its Blueprint path to `apps/vv8-home/render.yaml`; the service inherits the Blueprint's repository and branch.

The build command only checks that the prepared entry page exists. The viewer uses its committed HTML, CSS, JavaScript, JSON, images, and local Three.js files; it needs no package installation, compilation, server process, database, or secret. The offline Node model exporter and Blender image renderer are not run on Render.

Keep the complete `apps/vv8-home/dist/` directory in the repository, including `vendor/`, `assets/`, `geometry.json`, and `budget.json`. The site has no client-side URL router, so no catch-all rewrite is configured.

## Published content and updates

The published directory contains the apartment plan, 3D model, render images, and furnishing information. These files are served publicly by the static site.

The initial service creation deploys the selected revision. Subsequent deployments are manual because automatic deployments are disabled. Use the actual URL returned by Render after a successful deployment.

## Validation

On 2026-10-26, the monorepo Blueprint was checked locally against Render's current official JSON Schema (Draft 2020-12). It passed with no schema errors. Both file-presence commands above passed from their respective working directories in this checkout.

This was local schema validation, not Render CLI or API validation. Before applying the Blueprint, a current Render CLI can additionally check platform rules with:

```sh
render blueprints validate apps/vv8-home/render.yaml
```

Official references:

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Current Blueprint JSON Schema](https://render.com/schema/render.yaml.json)
- [Render static sites, including dependency installation](https://render.com/docs/static-sites)
