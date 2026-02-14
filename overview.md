# Azure Federated Auth Task

`AzureFederatedAuth@1` is an Azure Pipelines task that requests an OIDC token for an AzureRM service connection configured for workload identity federation.

It is designed for pipelines that need ARM federation variables without storing long-lived secrets.

## What It Sets

- `ARM_OIDC_TOKEN` (secret)
- `ARM_TENANT_ID`
- `ARM_CLIENT_ID`
- `GIT_ACCESS_TOKEN` (secret, optional)

## Task Input

- `serviceConnectionARM` (required): Azure Resource Manager service connection
- `setGitAccessToken` (optional): exchanges OIDC assertion for Azure DevOps scope and sets `GIT_ACCESS_TOKEN`
- `printTokenHashes` (optional, default `false`): prints SHA256 token hashes in logs

## Prerequisites

- AzureRM service connection using workload identity federation
- Pipeline access to `System.AccessToken`
- Linux YAML agents

## Example

```yaml
- task: AzureFederatedAuth@1
  inputs:
    serviceConnectionARM: 'my-arm-service-connection'
    setGitAccessToken: true
    printTokenHashes: false

- bash: |
    echo "Tenant: $ARM_TENANT_ID"
    if [[ ! "$ARM_CLIENT_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
      echo "ARM_CLIENT_ID is missing or not a GUID"
      exit 1
    fi
    test -n "${ARM_OIDC_TOKEN:-}" && echo "ARM_OIDC_TOKEN is set and not empty"
    test -n "${GIT_ACCESS_TOKEN:-}" && echo "GIT_ACCESS_TOKEN is set and not empty"
  env:
    ARM_OIDC_TOKEN: $(ARM_OIDC_TOKEN)
    GIT_ACCESS_TOKEN: $(GIT_ACCESS_TOKEN)
```

## Repository

https://gitea.koszewscy.waw.pl/koszewscy/ado-azurefederatedauth-task.git
