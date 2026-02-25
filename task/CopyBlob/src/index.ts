import * as tl from 'azure-pipelines-task-lib/task';
import {
  buildOidcUrl,
  exchangeOidcForScopedToken,
  getServiceConnectionMetadata,
  requireInput,
  requestOidcToken,
  requireVariable
} from '../../_shared/src/oidc';
const STORAGE_SCOPE = 'https://storage.azure.com/.default';

function buildBlobUrl(accountName: string, containerName: string, blobName: string): string {
  const trimmedBlobName = blobName.replace(/^\/+/, '');
  const encodedContainer = encodeURIComponent(containerName);
  const encodedBlobName = trimmedBlobName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `https://${accountName}.blob.core.windows.net/${encodedContainer}/${encodedBlobName}`;
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
    const endpointId = requireInput('serviceConnectionARM', tl.getInput);
    const srcStorageAccountName = requireInput('srcStorageAccountName', tl.getInput);
    const dstStorageAccountName = requireInput('dstStorageAccountName', tl.getInput);
    const srcContainerName = requireInput('srcContainerName', tl.getInput);
    const dstContainerNameInput = tl.getInput('dstContainerName', false)?.trim() || '';
    const blobName = requireInput('blobName', tl.getInput);

    const oidcBaseUrl = requireVariable('System.OidcRequestUri', tl.getVariable);
    const systemAccessToken = requireVariable('System.AccessToken', tl.getVariable);

    const metadata = getServiceConnectionMetadata(
      endpointId,
      tl.getEndpointAuthorizationParameter,
      tl.getEndpointDataParameter
    );
    const oidcRequestUrl = buildOidcUrl(oidcBaseUrl, endpointId);

    console.log('Requesting OIDC token for ARM authentication...');
    const oidcToken = await requestOidcToken(oidcRequestUrl, systemAccessToken, false);

    const dstContainerName = dstContainerNameInput || srcContainerName;
    const srcUrl = buildBlobUrl(srcStorageAccountName, srcContainerName, blobName);
    const dstUrl = buildBlobUrl(dstStorageAccountName, dstContainerName, blobName);

    console.log('Requesting storage access token from Microsoft Entra ID...');
    const accessToken = await exchangeOidcForScopedToken(metadata.tenantId, metadata.clientId, oidcToken, STORAGE_SCOPE);

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
