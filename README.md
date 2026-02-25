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
- `ListBlobs@1`
  - Lists blobs in a container (optional prefix) using the selected AzureRM service connection.
- `GetBlob@1`
  - Downloads a blob to a local file path using the selected AzureRM service connection.
- `PutBlob@1`
  - Uploads a local file as a blob using the selected AzureRM service connection.
- `SetupGitHubRelease@1`
  - Downloads and installs a binary from the latest GitHub release and prepends it to PATH.

## Repository layout

- `task/AzureFederatedAuth` - task implementation and manifest
- `task/CopyBlob` - task implementation and manifest
- `task/ListBlobs` - task implementation and manifest
- `task/GetBlob` - task implementation and manifest
- `task/PutBlob` - task implementation and manifest
- `task/SetupGitHubRelease` - task implementation and manifest
- `shared` - local npm package with shared OIDC/devops/blob helpers
- `scripts/build.sh` - builds tasks and packages the extension
- `examples/azure-pipelines-smoke.yml` - smoke pipeline example

## Local development

Prerequisites:

- Node.js (LTS)
- npm

Install dependencies:

```bash
npm install
```

Build and package extension:

```bash
./scripts/build.sh
```

Build flow details:

- builds `shared` package,
- packs it to `build/ado-sk-toolkit-shared.tgz`,
- installs that tarball into each task,
- compiles all tasks and creates VSIX.

Build output:

- shared package tarball in `build/ado-sk-toolkit-shared.tgz`
- Task JavaScript output in each task's `dist/`
- Extension package (`.vsix`) in `build/`

## Validation pipeline

Use `examples/azure-pipelines-smoke.yml` to validate task execution end-to-end in Azure Pipelines.

## Publishing notes (maintainers)

Publishing requires a Visual Studio Marketplace publisher and sharing the published extension with target Azure DevOps organizations.

## Author

Slawomir Koszewski

## AI Generated Content

Parts of this repository were generated with the assistance of AI. The author has reviewed and edited the AI-generated content to ensure accuracy and clarity.

## License

MIT. See `LICENSE`.
