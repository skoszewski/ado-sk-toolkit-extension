import * as tl from 'azure-pipelines-task-lib/task';

export type ServiceConnectionMetadata = {
  tenantId: string;
  clientId: string;
};

export type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

type OidcResponse = {
  oidcToken?: string;
};

export function getServiceConnectionMetadata(endpointId: string): ServiceConnectionMetadata {
  const tenantId =
    tl.getEndpointAuthorizationParameter(endpointId, 'tenantid', true) ||
    tl.getEndpointDataParameter(endpointId, 'tenantid', true);

  const clientId =
    tl.getEndpointAuthorizationParameter(endpointId, 'serviceprincipalid', true) ||
    tl.getEndpointAuthorizationParameter(endpointId, 'clientid', true) ||
    tl.getEndpointDataParameter(endpointId, 'serviceprincipalid', true);

  if (tenantId === undefined) {
    throw new Error('Could not resolve tenant ID from the selected AzureRM service connection.');
  }

  if (clientId === undefined) {
    throw new Error('Could not resolve client ID from the selected AzureRM service connection.');
  }

  return { tenantId, clientId };
}

export function buildOidcUrl(baseUrl: string, serviceConnectionId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('api-version', '7.1');
  url.searchParams.set('serviceConnectionId', serviceConnectionId);
  return url.toString();
}

function isJwtLike(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export async function requestOidcToken(requestUrl: string, accessToken: string, validateJwt: boolean): Promise<string> {
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

  if (validateJwt && !isJwtLike(token)) {
    throw new Error('OIDC token format is invalid (expected JWT).');
  }

  return token;
}

export async function exchangeOidcForScopedToken(
  tenantId: string,
  clientId: string,
  oidcToken: string,
  scope: string
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    scope,
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