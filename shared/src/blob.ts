import {
  buildOidcUrl,
  exchangeOidcForScopedToken,
  getServiceConnectionMetadata,
  requestOidcToken
} from './oidc';
import { requireVariable } from './devops-helpers';

export const STORAGE_SCOPE = 'https://storage.azure.com/.default';

export async function requestStorageAccessToken(
  endpointId: string
): Promise<string> {
  const oidcBaseUrl = requireVariable('System.OidcRequestUri');
  const systemAccessToken = requireVariable('System.AccessToken');

  const metadata = getServiceConnectionMetadata(endpointId);

  const oidcRequestUrl = buildOidcUrl(oidcBaseUrl, endpointId);
  const oidcToken = await requestOidcToken(oidcRequestUrl, systemAccessToken, false);

  return exchangeOidcForScopedToken(metadata.tenantId, metadata.clientId, oidcToken, STORAGE_SCOPE);
}

export function buildBlobUrl(accountName: string, containerName: string, blobName: string): string {
  const trimmedBlobName = blobName.replace(/^\/+/, '');
  const encodedContainer = encodeURIComponent(containerName);
  const encodedBlobName = trimmedBlobName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `https://${accountName}.blob.core.windows.net/${encodedContainer}/${encodedBlobName}`;
}