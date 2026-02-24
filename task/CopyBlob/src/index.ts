import * as tl from 'azure-pipelines-task-lib/task';

type OidcResponse = {
  oidcToken?: string;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const STORAGE_SCOPE = 'https://storage.azure.com/.default';

function requireInput(name: string): string {
  const value = tl.getInput(name, true);
  if (!value) {
    throw new Error(`Task input ${name} is required.`);
  }

  return value.trim();
}

function requireVariable(name: string): string {
  const value = tl.getVariable(name);
  if (!value) {
    throw new Error(`Missing required variable: ${name}.`);
  }

  return value.trim();
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

  return token;
}

function buildBlobUrl(accountName: string, containerName: string, blobName: string): string {
  const trimmedBlobName = blobName.replace(/^\/+/, '');
  const encodedContainer = encodeURIComponent(containerName);
  const encodedBlobName = trimmedBlobName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `https://${accountName}.blob.core.windows.net/${encodedContainer}/${encodedBlobName}`;
}

async function exchangeOidcForStorageToken(tenantId: string, clientId: string, oidcToken: string): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    scope: STORAGE_SCOPE,
    grant_type: 'client_credentials',
    client_assertion_type: CLIENT_ASSERTION_TYPE,
    client_assertion: oidcToken
  }).toString();

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const rawBody = await response.text();
  let parsed: TokenResponse = {};

  if (rawBody.trim()) {
    try {
      parsed = JSON.parse(rawBody) as TokenResponse;
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const details = parsed.error_description || parsed.error || rawBody || 'Unknown token exchange error.';
    throw new Error(`Token request failed (${response.status} ${response.statusText}): ${details}`);
  }

  const token = parsed.access_token?.trim();
  if (!token) {
    throw new Error('Token exchange succeeded but access_token is missing.');
  }

  return token;
}

async function copyBlob(
  sourceUrl: string,
  destinationUrl: string,
  bearerToken: string
): Promise<{ copyStatus: string; copyId: string }> {
  const response = await fetch(destinationUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'x-ms-version': '2020-10-02',
      'x-ms-date': new Date().toUTCString(),
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-copy-source': sourceUrl,
      'x-ms-copy-source-authorization': `Bearer ${bearerToken}`,
      'Content-Length': '0'
    },
    body: ''
  });

  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(`Copy request failed (${response.status} ${response.statusText}): ${rawBody}`);
  }

  const copyStatus = (response.headers.get('x-ms-copy-status') || '').trim();
  const copyId = (response.headers.get('x-ms-copy-id') || '').trim();

  return { copyStatus, copyId };
}

async function run(): Promise<void> {
  try {
    const endpointId = requireInput('serviceConnectionARM');
    const srcStorageAccountName = requireInput('srcStorageAccountName');
    const dstStorageAccountName = requireInput('dstStorageAccountName');
    const srcContainerName = requireInput('srcContainerName');
    const dstContainerNameInput = tl.getInput('dstContainerName', false)?.trim() || '';
    const blobName = requireInput('blobName');

    const oidcBaseUrl = requireVariable('System.OidcRequestUri');
    const systemAccessToken = requireVariable('System.AccessToken');

    const metadata = getServiceConnectionMetadata(endpointId);
    const oidcRequestUrl = buildOidcUrl(oidcBaseUrl, endpointId);

    console.log('Requesting OIDC token for ARM authentication...');
    const oidcToken = await requestOidcToken(oidcRequestUrl, systemAccessToken);

    const dstContainerName = dstContainerNameInput || srcContainerName;
    const srcUrl = buildBlobUrl(srcStorageAccountName, srcContainerName, blobName);
    const dstUrl = buildBlobUrl(dstStorageAccountName, dstContainerName, blobName);

    console.log('Requesting storage access token from Microsoft Entra ID...');
    const accessToken = await exchangeOidcForStorageToken(metadata.tenantId, metadata.clientId, oidcToken);

    console.log(`Copying blob ${srcStorageAccountName}/${srcContainerName}/${blobName} -> ${dstStorageAccountName}/${dstContainerName}/${blobName}...`);
    const copyResult = await copyBlob(srcUrl, dstUrl, accessToken);

    if (copyResult.copyStatus && copyResult.copyStatus.toLowerCase() !== 'success') {
      throw new Error(`Copy operation completed with unexpected status: ${copyResult.copyStatus}`);
    }

    if (copyResult.copyId) {
      tl.setVariable('COPY_BLOB_OPERATION_ID', copyResult.copyId);
    }

    tl.setResult(tl.TaskResult.Succeeded, 'Blob copied successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `CopyBlob failed: ${message}`);
  }
}

void run();
