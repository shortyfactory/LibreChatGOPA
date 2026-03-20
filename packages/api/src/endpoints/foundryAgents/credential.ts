import https from 'node:https';
import { promises as dnsPromises } from 'node:dns';
import type { AccessToken, GetTokenOptions, TokenCredential } from '@azure/core-auth';

const entraHost = 'login.microsoftonline.com';
const refreshBufferMs = 2 * 60 * 1000;

type FoundryServicePrincipalConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

type EntraTokenResponse = {
  token_type?: string;
  expires_in?: number;
  expires_on?: number | string;
  access_token?: string;
  error?: string;
  error_description?: string;
};

function getTrimmedEnvValue(key: string): string | null {
  const value = process.env[key]?.trim();
  return value?.length ? value : null;
}

export function getFoundryServicePrincipalConfig(): FoundryServicePrincipalConfig | null {
  const tenantId = getTrimmedEnvValue('AZURE_TENANT_ID');
  const clientId = getTrimmedEnvValue('AZURE_CLIENT_ID');
  const clientSecret = getTrimmedEnvValue('AZURE_CLIENT_SECRET');

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  return {
    tenantId,
    clientId,
    clientSecret,
  };
}

function normalizeScope(scopes: string | string[]): string {
  if (typeof scopes === 'string') {
    return scopes;
  }

  if (scopes.length === 0) {
    throw new Error('Foundry token request is missing scopes.');
  }

  return scopes[0];
}

function getExpiresOnTimestamp(response: EntraTokenResponse): number {
  const expiresOn = response.expires_on;
  if (typeof expiresOn === 'number') {
    return expiresOn * 1000;
  }

  if (typeof expiresOn === 'string' && expiresOn.trim()) {
    const numericValue = Number(expiresOn);
    if (!Number.isNaN(numericValue)) {
      return numericValue * 1000;
    }
  }

  const expiresIn = response.expires_in;
  if (typeof expiresIn === 'number' && expiresIn > 0) {
    return Date.now() + expiresIn * 1000;
  }

  return Date.now() + 60 * 60 * 1000;
}

async function resolveFirstIPv4Address(hostname: string): Promise<string> {
  const addresses = await dnsPromises.resolve4(hostname);
  const address = addresses[0];

  if (!address) {
    throw new Error(`Unable to resolve an IPv4 address for ${hostname}.`);
  }

  return address;
}

async function requestServicePrincipalToken({
  tenantId,
  clientId,
  clientSecret,
  scope,
}: FoundryServicePrincipalConfig & {
  scope: string;
}): Promise<AccessToken> {
  const address = await resolveFirstIPv4Address(entraHost);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope,
  }).toString();

  const responseText = await new Promise<string>((resolve, reject) => {
    const request = https.request(
      {
        method: 'POST',
        family: 4,
        host: address,
        servername: entraHost,
        path: `/${tenantId}/oauth2/v2.0/token`,
        headers: {
          Host: entraHost,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let data = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `Foundry token request failed with status ${statusCode}: ${data.slice(0, 500)}`,
              ),
            );
            return;
          }

          resolve(data);
        });
      },
    );

    request.on('error', (error) => {
      reject(error);
    });

    request.write(body);
    request.end();
  });

  const tokenResponse = JSON.parse(responseText) as EntraTokenResponse;

  if (!tokenResponse.access_token) {
    throw new Error(
      tokenResponse.error_description ??
        tokenResponse.error ??
        'Foundry token request did not return an access token.',
    );
  }

  return {
    token: tokenResponse.access_token,
    expiresOnTimestamp: getExpiresOnTimestamp(tokenResponse),
  };
}

export class FoundryServicePrincipalCredential implements TokenCredential {
  private readonly tokenCache = new Map<string, AccessToken>();
  private readonly clientSecret: string;
  private readonly clientId: string;
  private readonly tenantId: string;

  constructor({ tenantId, clientId, clientSecret }: FoundryServicePrincipalConfig) {
    this.clientSecret = clientSecret;
    this.clientId = clientId;
    this.tenantId = tenantId;
  }

  async getToken(
    scopes: string | string[],
    _options?: GetTokenOptions,
  ): Promise<AccessToken | null> {
    const scope = normalizeScope(scopes);
    const cachedToken = this.tokenCache.get(scope);

    if (cachedToken && cachedToken.expiresOnTimestamp - refreshBufferMs > Date.now()) {
      return cachedToken;
    }

    const token = await requestServicePrincipalToken({
      scope,
      tenantId: this.tenantId,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });

    this.tokenCache.set(scope, token);
    return token;
  }
}
