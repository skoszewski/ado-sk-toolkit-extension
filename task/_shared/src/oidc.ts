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

type VariableProvider = (name: string) => string | undefined;
type EndpointParamProvider = (endpointId: string, key: string, optional: boolean) => string | undefined;
type InputProvider = (name: string, required?: boolean) => string | undefined;

type OidcResponse = {
  oidcToken?: string;
};

export function requireVariable(name: string, getVariable: VariableProvider): string {
  const value = getVariable(name);
  if (!value) {
    throw new Error(`Missing required pipeline variable: ${name}.`);
  }

  return value.trim();
}

export function requireInput(name: string, getInput: InputProvider): string {
  const value = getInput(name, true);
  if (!value) {
    throw new Error(`Task input ${name} is required.`);
  }

  return value.trim();
}

export function getServiceConnectionMetadata(
  endpointId: string,
  getEndpointAuthorizationParameter: EndpointParamProvider,
  getEndpointDataParameter: EndpointParamProvider
): ServiceConnectionMetadata {
  const tenantId =
    getEndpointAuthorizationParameter(endpointId, 'tenantid', true) ||
    getEndpointDataParameter(endpointId, 'tenantid', true);

  const clientId =
    getEndpointAuthorizationParameter(endpointId, 'serviceprincipalid', true) ||
    getEndpointAuthorizationParameter(endpointId, 'clientid', true) ||
    getEndpointDataParameter(endpointId, 'serviceprincipalid', true);

  if (!tenantId) {
    throw new Error('Could not resolve tenant ID from the selected AzureRM service connection.');
  }

  if (!clientId) {
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
