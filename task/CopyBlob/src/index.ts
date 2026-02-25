import * as tl from 'azure-pipelines-task-lib/task';
import {
  buildBlobUrl,
  requestStorageAccessToken,
  requireInput
} from '@skoszewski/ado-sk-toolkit-shared';

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

    console.log('Requesting storage access token from Microsoft Entra ID...');
    const accessToken = await requestStorageAccessToken(endpointId);

    const dstContainerName = dstContainerNameInput || srcContainerName;
    const srcUrl = buildBlobUrl(srcStorageAccountName, srcContainerName, blobName);
    const dstUrl = buildBlobUrl(dstStorageAccountName, dstContainerName, blobName);

    console.log(`Copying blob ${srcStorageAccountName}/${srcContainerName}/${blobName} -> ${dstStorageAccountName}/${dstContainerName}/${blobName}...`);
    const copyResult = await copyBlob(srcUrl, dstUrl, accessToken);

    if (copyResult.copyStatus && copyResult.copyStatus.toLowerCase() !== 'success') {
      throw new Error(`Copy operation completed with unexpected status: ${copyResult.copyStatus}`);
    }

    tl.setResult(tl.TaskResult.Succeeded, 'Blob copied successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `CopyBlob failed: ${message}`);
  }
}

void run();
