import * as tl from 'azure-pipelines-task-lib/task';
import {
  requestStorageAccessToken,
  requireInput
} from '@skoszewski/ado-sk-toolkit-shared';

function decodeXmlValue(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseBlobNames(xml: string): string[] {
  const regex = /<Name>([\s\S]*?)<\/Name>/g;
  const names: string[] = [];
  let match: RegExpExecArray | null = regex.exec(xml);

  while (match) {
    names.push(decodeXmlValue(match[1].trim()));
    match = regex.exec(xml);
  }

  return names;
}

function buildListUrl(storageAccountName: string, containerName: string, prefix: string): string {
  const url = new URL(`https://${storageAccountName}.blob.core.windows.net/${encodeURIComponent(containerName)}`);
  url.searchParams.set('restype', 'container');
  url.searchParams.set('comp', 'list');

  if (prefix) {
    url.searchParams.set('prefix', prefix);
  }

  return url.toString();
}

async function listBlobs(listUrl: string, bearerToken: string): Promise<string[]> {
  const response = await fetch(listUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'x-ms-version': '2020-10-02',
      'x-ms-date': new Date().toUTCString()
    }
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`List blobs request failed (${response.status} ${response.statusText}): ${body}`);
  }

  return parseBlobNames(body);
}

async function run(): Promise<void> {
  try {
    const endpointId = requireInput('serviceConnectionARM');
    const storageAccountName = requireInput('storageAccountName');
    const containerName = requireInput('containerName');
    const prefix = tl.getInput('prefix', false)?.trim() || '';

    console.log('Requesting storage access token from Microsoft Entra ID...');
    const accessToken = await requestStorageAccessToken(endpointId);

    const listUrl = buildListUrl(storageAccountName, containerName, prefix);
    const blobNames = await listBlobs(listUrl, accessToken);

    const serialized = JSON.stringify(blobNames);
    tl.setVariable('LIST_BLOBS_JSON', serialized);

    console.log(`Found ${blobNames.length} blob(s).`);
    if (blobNames.length > 0) {
      console.log(blobNames.join('\n'));
    }

    tl.setResult(tl.TaskResult.Succeeded, `Listed ${blobNames.length} blob(s).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `ListBlobs failed: ${message}`);
  }
}

void run();
