# Azure DevOps Azure Federated Auth Task

Azure DevOps extension with a single task: `AzureFederatedAuth@1`.

The task requests an OIDC token for a selected AzureRM service connection and exports:

- `ARM_OIDC_TOKEN` (secret)
- `ARM_TENANT_ID`
- `ARM_CLIENT_ID`
- `GIT_ACCESS_TOKEN` (secret, optional)

## Requirements

- Linux agents (YAML pipelines)
- Job setting that exposes OAuth token (`System.AccessToken`)
- AzureRM service connection with workload identity federation
- Visual Studio Marketplace publisher account (required to publish/share this extension, including org-only usage)

## Build

```bash
./scripts/build.sh
```

This builds the TypeScript task and creates a `.vsix` extension package in `build/`.

## Publish privately

Publishing (CLI or Web UI) uses the same model:
- Upload extension version under a Visual Studio Marketplace publisher
- Share that published extension with your Azure DevOps organization(s)

There is no direct local `.vsix` install path to an org that bypasses the publisher model.

```bash
AZDO_PAT='<your-pat>' ./scripts/publish.sh <vsix-path> <publisher-id> <org1> <org2> <org3>
```

Example:

```bash
AZDO_PAT="$AZDO_PAT" ./scripts/publish.sh ./build/skoszewski-lab.azuredevops-get-oidc-token-task-1.0.3.vsix skoszewski-lab org-a org-b org-c
```

### Manual publish (Web UI)

You can publish the generated `.vsix` manually in the Visual Studio Marketplace publisher portal:

1. Build/package first (`./scripts/build.sh`) and note the `.vsix` path.
2. Open your publisher in Visual Studio Marketplace.
3. Upload the `.vsix` as a new extension version.
4. Share the published extension with the target Azure DevOps organization(s).

## YAML usage

```yaml
- task: AzureFederatedAuth@1
  inputs:
    serviceConnectionARM: 'my-arm-service-connection'
    setGitAccessToken: true
```

See `examples/azure-pipelines-smoke.yml` for a full smoke validation pipeline.

When `setGitAccessToken: true`, the task exchanges the OIDC assertion against Entra ID and requests scope `499b84ac-1321-427f-aa17-267ca6975798/.default`, then sets `GIT_ACCESS_TOKEN`.
