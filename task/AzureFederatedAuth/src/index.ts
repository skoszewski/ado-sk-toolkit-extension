import * as crypto from 'crypto';
import * as tl from 'azure-pipelines-task-lib/task';
import {
  buildOidcUrl,
  exchangeOidcForScopedToken,
  getServiceConnectionMetadata,
  requestOidcToken
} from '@skoszewski/ado-sk-toolkit-shared';

const AZDO_APP_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

async function run(): Promise<void> {
  try {
    const endpointId = tl.getInputRequired('serviceConnectionARM');
    const setGitAccessToken = tl.getBoolInput('setGitAccessToken', false);
    const printTokenHashes = tl.getBoolInput('printTokenHashes', false);

    const oidcBaseUrl = tl.getVariable('System.OidcRequestUri');
    const accessToken = tl.getVariable('System.AccessToken');

    if (oidcBaseUrl === undefined) {
      throw new Error('Missing required pipeline variable: System.OidcRequestUri.');
    }

    if (accessToken === undefined) {
      throw new Error('Missing required pipeline variable: System.AccessToken.');
    }

    console.log('Requesting OIDC token for ARM authentication...');

    const requestUrl = buildOidcUrl(oidcBaseUrl, endpointId);
    const token = await requestOidcToken(requestUrl, accessToken, true);
    const metadata = getServiceConnectionMetadata(endpointId);

    tl.setVariable('ARM_OIDC_TOKEN', token, true);
    tl.setVariable('ARM_TENANT_ID', metadata.tenantId);
    tl.setVariable('ARM_CLIENT_ID', metadata.clientId);

    console.log('Successfully retrieved OIDC token.');
    if (printTokenHashes) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      console.log(`OIDC Token SHA256: ${tokenHash}`);
    }

    if (setGitAccessToken) {
      console.log('Exchanging OIDC token for Azure DevOps scoped Git access token...');
      const gitToken = await exchangeOidcForScopedToken(metadata.tenantId, metadata.clientId, token, AZDO_APP_SCOPE);
      tl.setVariable('GIT_ACCESS_TOKEN', gitToken, true);
      if (printTokenHashes) {
        const gitTokenHash = crypto.createHash('sha256').update(gitToken).digest('hex');
        console.log(`GIT Access Token SHA256: ${gitTokenHash}`);
      }
    }

    tl.setResult(tl.TaskResult.Succeeded, 'ARM OIDC variables configured.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `Failed to configure ARM OIDC variables: ${message}`);
  }
}

void run();
