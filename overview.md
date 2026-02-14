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
```

## Repository

https://gitea.koszewscy.waw.pl/koszewscy/ado-azurefederatedauth-task.git
