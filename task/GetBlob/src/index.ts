import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as tl from 'azure-pipelines-task-lib/task';
import {
  buildBlobUrl,
  requestStorageAccessToken
} from '@skoszewski/ado-sk-toolkit-shared';

async function downloadBlob(blobUrl: string, bearerToken: string): Promise<Buffer> {
  const response = await fetch(blobUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'x-ms-version': '2020-10-02',
      'x-ms-date': new Date().toUTCString()
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Get blob request failed (${response.status} ${response.statusText}): ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function run(): Promise<void> {
  try {
    const endpointId = tl.getInputRequired('serviceConnectionARM');
    const storageAccountName = tl.getInputRequired('storageAccountName');
    const containerName = tl.getInputRequired('containerName');
    const blobName = tl.getInputRequired('blobName');
    const destinationPath = tl.getInputRequired('destinationPath');

    console.log('Requesting storage access token from Microsoft Entra ID...');
    const accessToken = await requestStorageAccessToken(endpointId);

    const blobUrl = buildBlobUrl(storageAccountName, containerName, blobName);
    console.log(`Downloading ${storageAccountName}/${containerName}/${blobName}...`);

    const blobData = await downloadBlob(blobUrl, accessToken);

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.writeFile(destinationPath, blobData);

    tl.setResult(tl.TaskResult.Succeeded, `Blob downloaded to ${destinationPath}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `GetBlob failed: ${message}`);
  }
}

void run();
