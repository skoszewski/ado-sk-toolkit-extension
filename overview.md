# SK Azure DevOps Toolkit

Azure DevOps extension with two pipeline tasks:

- `AzureFederatedAuth@1` - requests OIDC token for an AzureRM service connection (workload identity federation) and sets:
  - `ARM_OIDC_TOKEN` (secret)
  - `ARM_TENANT_ID`
  - `ARM_CLIENT_ID`
  - `GIT_ACCESS_TOKEN` (secret, optional)
- `CopyBlob@1` - copies a blob between Azure Storage accounts/containers using the selected AzureRM service connection.

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

https://gitea.koszewscy.waw.pl/koszewscy/ado-sk-toolkit-extension.git

## Author

Slawomir Koszewski

## License

MIT. See `LICENSE`.
