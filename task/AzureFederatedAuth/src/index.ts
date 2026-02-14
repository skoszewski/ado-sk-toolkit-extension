import * as crypto from 'crypto';
import * as tl from 'azure-pipelines-task-lib/task';

type OidcResponse = {
  oidcToken?: string;
};

type EntraTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

const AZDO_APP_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';
const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

function requireVariable(name: string): string {
  const value = tl.getVariable(name);
  if (!value) {
    throw new Error(`Missing required pipeline variable: ${name}.`);
  }

  return value;
}

function getServiceConnectionMetadata(endpointId: string): { tenantId: string; clientId: string } {
  const tenantId =
    tl.getEndpointAuthorizationParameter(endpointId, 'tenantid', true) ||
    tl.getEndpointDataParameter(endpointId, 'tenantid', true);

  const clientId =
    tl.getEndpointAuthorizationParameter(endpointId, 'serviceprincipalid', true) ||
    tl.getEndpointAuthorizationParameter(endpointId, 'clientid', true) ||
    tl.getEndpointDataParameter(endpointId, 'serviceprincipalid', true);

  if (!tenantId) {
    throw new Error('Could not resolve tenant ID from the selected AzureRM service connection.');
  }

  if (!clientId) {
    throw new Error('Could not resolve client ID from the selected AzureRM service connection.');
  }

  return { tenantId, clientId };
}

function buildOidcUrl(baseUrl: string, serviceConnectionId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('api-version', '7.1');
  url.searchParams.set('serviceConnectionId', serviceConnectionId);
  return url.toString();
}

function isJwtLike(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

async function requestOidcToken(requestUrl: string, accessToken: string): Promise<string> {
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': '0'
    }
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `OIDC request failed with status ${response.status} ${response.statusText}. Response: ${responseBody}`
    );
  }

  const data = (await response.json()) as OidcResponse;
  const token = data.oidcToken?.trim();

  if (!token) {
    throw new Error('OIDC response did not include a non-empty oidcToken field.');
  }

  if (!isJwtLike(token)) {
    throw new Error('OIDC token format is invalid (expected JWT).');
  }

  return token;
}

async function exchangeOidcForAzureDevOpsToken(
  tenantId: string,
  clientId: string,
  oidcToken: string
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    scope: AZDO_APP_SCOPE,
    client_assertion_type: CLIENT_ASSERTION_TYPE,
    client_assertion: oidcToken
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const rawBody = await response.text();
  let data: EntraTokenResponse = {};

  if (rawBody.trim().length > 0) {
    try {
      data = JSON.parse(rawBody) as EntraTokenResponse;
    } catch {
      // Keep rawBody for error details when the response is not JSON.
    }
  }

  const token = data.access_token?.trim();

  if (!response.ok) {
    const errorDetails =
      data.error_description || data.error || rawBody.trim() || 'Unknown token exchange error.';
    throw new Error(
      `Failed to exchange OIDC token for Azure DevOps Git token (${response.status} ${response.statusText}): ${errorDetails}`
    );
  }

  if (!token) {
    throw new Error('Token exchange succeeded but no access_token was returned.');
  }

  return token;
}

async function run(): Promise<void> {
  try {
    const endpointId = tl.getInput('serviceConnectionARM', true);
    const setGitAccessToken = tl.getBoolInput('setGitAccessToken', false);
    if (!endpointId) {
      throw new Error('Task input serviceConnectionARM is required.');
    }

    const oidcBaseUrl = requireVariable('System.OidcRequestUri');
    const accessToken = requireVariable('System.AccessToken');

    console.log('Requesting OIDC token for ARM authentication...');

    const requestUrl = buildOidcUrl(oidcBaseUrl, endpointId);
    const token = await requestOidcToken(requestUrl, accessToken);
    const metadata = getServiceConnectionMetadata(endpointId);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    tl.setVariable('ARM_OIDC_TOKEN', token, true);
    tl.setVariable('ARM_TENANT_ID', metadata.tenantId);
    tl.setVariable('ARM_CLIENT_ID', metadata.clientId);

    console.log('Successfully retrieved OIDC token.');
    console.log(`OIDC Token SHA256: ${tokenHash}`);

    if (setGitAccessToken) {
      console.log('Exchanging OIDC token for Azure DevOps scoped Git access token...');
      const gitToken = await exchangeOidcForAzureDevOpsToken(metadata.tenantId, metadata.clientId, token);
      const gitTokenHash = crypto.createHash('sha256').update(gitToken).digest('hex');
      tl.setVariable('GIT_ACCESS_TOKEN', gitToken, true);
      console.log(`GIT Access Token SHA256: ${gitTokenHash}`);
    }

    tl.setResult(tl.TaskResult.Succeeded, 'ARM OIDC variables configured.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `Failed to configure ARM OIDC variables: ${message}`);
  }
}

void run();
