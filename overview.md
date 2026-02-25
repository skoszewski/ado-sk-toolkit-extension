# SK Azure DevOps Toolkit

Azure DevOps extension with pipeline tasks for federated auth and blob/state operations:

- `AzureFederatedAuth@1` - requests OIDC token for an AzureRM service connection (workload identity federation) and sets:
  - `ARM_OIDC_TOKEN` (secret)
  - `ARM_TENANT_ID`
  - `ARM_CLIENT_ID`
  - `GIT_ACCESS_TOKEN` (secret, optional)
- `CopyBlob@1` - copies a blob between Azure Storage accounts/containers using the selected AzureRM service connection.
- `ListBlobs@1` - lists blobs in a container (optional prefix) using the selected AzureRM service connection.
- `GetBlob@1` - downloads a blob to a local file path using the selected AzureRM service connection.
- `PutBlob@1` - uploads a local file as a blob using the selected AzureRM service connection.
- `SetupGitHubRelease@1` - downloads and installs a binary from the latest GitHub release and prepends it to PATH.

Implementation note: task shared helpers are packaged locally during build and bundled with the extension (no external package registry access required at runtime).

## Prerequisites

- AzureRM service connection configured for workload identity federation
- Pipeline access to `System.AccessToken`

## Example

```yaml
- task: AzureFederatedAuth@1
  inputs:
    serviceConnectionARM: 'my-arm-service-connection'
    setGitAccessToken: true

- task: CopyBlob@1
  inputs:
    serviceConnectionARM: 'my-arm-service-connection'
    srcStorageAccountName: 'srcaccount'
    dstStorageAccountName: 'dstaccount'
    srcContainerName: 'tfstate'
    dstContainerName: 'tfstate-backup'
    blobName: 'lz.tfstate'
```

## Repository

https://github.com/skoszewski/ado-sk-toolkit-extension.git

## Author

Slawomir Koszewski

## AI Generated Content

Parts of this extension's source code were generated with the assistance of AI. The author has reviewed and edited the AI-generated content to ensure accuracy and clarity.

## License

MIT. See `LICENSE`.
