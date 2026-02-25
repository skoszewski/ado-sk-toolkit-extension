import * as fs from 'node:fs/promises';
import * as tl from 'azure-pipelines-task-lib/task';
import {
  buildBlobUrl,
  requestStorageAccessToken,
  requireInput
} from '@skoszewski/ado-sk-toolkit-shared';

async function uploadBlob(
  blobUrl: string,
  bearerToken: string,
  content: Buffer,
  contentType: string
): Promise<void> {
  const payload = new Uint8Array(content);

  const response = await fetch(blobUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'x-ms-version': '2020-10-02',
      'x-ms-date': new Date().toUTCString(),
      'x-ms-blob-type': 'BlockBlob',
      'Content-Type': contentType,
      'Content-Length': String(content.length)
    },
    body: payload
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Put blob request failed (${response.status} ${response.statusText}): ${body}`);
  }
}

async function run(): Promise<void> {
  try {
    const endpointId = requireInput('serviceConnectionARM');
    const storageAccountName = requireInput('storageAccountName');
    const containerName = requireInput('containerName');
    const blobName = requireInput('blobName');
    const sourcePath = requireInput('sourcePath');
    const contentType = tl.getInput('contentType', false)?.trim() || 'application/octet-stream';

    console.log('Requesting storage access token from Microsoft Entra ID...');
    const accessToken = await requestStorageAccessToken(endpointId);

    const blobUrl = buildBlobUrl(storageAccountName, containerName, blobName);
    const fileContent = await fs.readFile(sourcePath);

    console.log(`Uploading ${sourcePath} -> ${storageAccountName}/${containerName}/${blobName}...`);
    await uploadBlob(blobUrl, accessToken, fileContent, contentType);

    tl.setResult(tl.TaskResult.Succeeded, 'Blob uploaded successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `PutBlob failed: ${message}`);
  }
}

void run();
