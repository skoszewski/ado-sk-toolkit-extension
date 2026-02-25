# SK Azure DevOps Toolkit

Developer README for the Azure DevOps extension codebase.

For administrator-facing installation and usage guidance, see `overview.md`.

## Tasks in this extension

- `AzureFederatedAuth@1`
  - Requests an OIDC token for a selected AzureRM service connection (workload identity federation).
  - Exports:
    - `ARM_OIDC_TOKEN` (secret)
    - `ARM_TENANT_ID`
    - `ARM_CLIENT_ID`
    - `GIT_ACCESS_TOKEN` (secret, optional)
- `CopyBlob@1`
  - Copies a blob between Azure Storage accounts/containers using the selected AzureRM service connection.

## Repository layout

- `task/AzureFederatedAuth` - task implementation and manifest
- `task/CopyBlob` - task implementation and manifest
- `task/_shared` - shared OIDC/auth helpers used by tasks
- `scripts/build.sh` - builds tasks and packages the extension
- `examples/azure-pipelines-smoke.yml` - smoke pipeline example

## Local development

Prerequisites:

- Node.js (LTS)
- npm

Install dependencies (per task):

```bash
cd task/AzureFederatedAuth && npm install
cd ../CopyBlob && npm install
```

Build and package extension:

```bash
./scripts/build.sh
```

Build output:

- Task JavaScript output in each task's `dist/`
- Extension package (`.vsix`) in `build/`

## Validation pipeline

Use `examples/azure-pipelines-smoke.yml` to validate task execution end-to-end in Azure Pipelines.

## Publishing notes (maintainers)

Publishing requires a Visual Studio Marketplace publisher and sharing the published extension with target Azure DevOps organizations.

## Author

Slawomir Koszewski

## License

MIT. See `LICENSE`.
