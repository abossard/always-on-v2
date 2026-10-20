import { execFile as execFileCb } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);
const managementOrigin = 'https://management.azure.com';
const defaultApiResource = `${managementOrigin}/`;
const defaultTokenRefreshSkewMs = 60_000;
const defaultTimeoutMs = 30_000;
const defaultMaxSkipTokenLength = 1024;

export type AzureArmHttpMethod = 'GET' | 'PUT' | 'POST';

export interface AzureArmTransportRequest {
  readonly method: AzureArmHttpMethod;
  readonly url: string;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface AzureArmTransportResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers: Readonly<Record<string, string>>;
}

export interface AzureArmAllowedOperation {
  readonly method: AzureArmHttpMethod;
  readonly path: string;
  readonly apiVersion: string;
  readonly allowSkipToken?: boolean;
}

export interface AzureArmTokenResult {
  readonly accessToken: string;
  readonly expiresOn?: string | number | Date;
}

export interface AzureArmFetchInit {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly redirect: 'manual';
}

export interface AzureArmFetchResponse {
  readonly status: number;
  readonly headers: Headers;
  text(): Promise<string>;
}

export interface AzureArmRequestFactoryOptions {
  readonly protocol: string;
  readonly hostname: string;
  readonly port?: number;
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface AzureArmIncomingMessageLike {
  readonly statusCode?: number;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  on(event: 'data', listener: (chunk: Buffer | string) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export interface AzureArmClientRequestLike {
  on(event: 'error', listener: (error: Error) => void): this;
  write(chunk: string): void;
  end(): void;
  destroy(error?: Error): void;
}

export interface AzureArmTransportDependencies {
  readonly fetch: (url: string, init: AzureArmFetchInit) => Promise<AzureArmFetchResponse>;
  readonly requestFactory: (
    options: AzureArmRequestFactoryOptions,
    onResponse: (response: AzureArmIncomingMessageLike) => void,
  ) => AzureArmClientRequestLike;
  readonly tokenProvider: (input: {
    readonly tenantId: string;
    readonly subscriptionId: string;
    readonly resource: string;
  }) => Promise<AzureArmTokenResult>;
  readonly commandRunner: (file: string, args: readonly string[]) => Promise<{ readonly stdout: string }>;
  readonly now: () => number;
}

export interface CreateAzureArmTransportInput {
  readonly tenantId: string;
  readonly subscriptionId: string;
  readonly allowedOperations: readonly AzureArmAllowedOperation[];
  readonly timeoutMs?: number;
  readonly maxSkipTokenLength?: number;
  readonly tokenRefreshSkewMs?: number;
  readonly dependencies?: Partial<AzureArmTransportDependencies>;
}

export interface AzureArmTransport {
  execute(request: AzureArmTransportRequest): Promise<AzureArmTransportResponse>;
  request(input: AzureArmTransportRequest): Promise<AzureArmTransportResponse>;
}

interface ParsedRequest {
  readonly url: URL;
  readonly operation: AzureArmAllowedOperation;
}

export function createAzureArmTransport(input: CreateAzureArmTransportInput): AzureArmTransport {
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
  const maxSkipTokenLength = input.maxSkipTokenLength ?? defaultMaxSkipTokenLength;
  const tokenRefreshSkewMs = input.tokenRefreshSkewMs ?? defaultTokenRefreshSkewMs;
  const dependencies = resolveDependencies(input.dependencies);
  const allowedOperations = input.allowedOperations.map(operation => ({ ...operation }));
  let cachedToken: { value: string; expiresAtMs?: number } | null = null;

  async function execute(request: AzureArmTransportRequest): Promise<AzureArmTransportResponse> {
    const parsed = validateRequest({
      request,
      subscriptionId: input.subscriptionId,
      allowedOperations,
      maxSkipTokenLength,
    });
    const token = await getAccessToken();
    const { signal, cleanup } = createAbortSignal(request.signal, request.timeoutMs ?? timeoutMs);
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...request.headers,
    };
    if (Object.keys(headers).some(key => key.toLowerCase() === 'authorization' && key !== 'Authorization')) {
      throw new Error('Request headers must not override authorization');
    }

    let response: AzureArmFetchResponse;
    try {
      response = await dependencies.fetch(parsed.url.toString(), {
        method: request.method,
        headers: request.body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal,
        redirect: 'manual',
      });
    } catch (error) {
      throw wrapTransportError(request.method, parsed.url.toString(), error);
    } finally {
      cleanup();
    }
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Redirect response is not allowed (status ${response.status})`);
    }

    const parsedResponse = await parseResponse(response);
    validateNextLinkIfPresent({
      request,
      requestUrl: parsed.url,
      operation: parsed.operation,
      maxSkipTokenLength,
      responseBody: parsedResponse.body,
    });
    return parsedResponse;
  }

  async function getAccessToken(): Promise<string> {
    const now = dependencies.now();
    if (cachedToken && cachedToken.expiresAtMs && cachedToken.expiresAtMs - tokenRefreshSkewMs > now) {
      return cachedToken.value;
    }
    if (cachedToken && cachedToken.expiresAtMs === undefined) {
      return cachedToken.value;
    }

    const token = await dependencies.tokenProvider({
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId,
      resource: defaultApiResource,
    });
    if (!token.accessToken || token.accessToken.trim().length === 0) {
      throw new Error('Token provider returned an empty access token');
    }
    cachedToken = { value: token.accessToken, expiresAtMs: parseExpiry(token.expiresOn) };
    return cachedToken.value;
  }

  return {
    execute,
    request: execute,
  };
}

function resolveDependencies(overrides?: Partial<AzureArmTransportDependencies>): AzureArmTransportDependencies {
  const requestFactory = overrides?.requestFactory ?? defaultRequestFactory;
  return {
    fetch: overrides?.fetch ?? defaultFetch(requestFactory),
    requestFactory,
    commandRunner: overrides?.commandRunner ?? defaultCommandRunner,
    tokenProvider: overrides?.tokenProvider ?? defaultTokenProvider(overrides?.commandRunner ?? defaultCommandRunner),
    now: overrides?.now ?? (() => Date.now()),
  };
}

function defaultTokenProvider(commandRunner: AzureArmTransportDependencies['commandRunner']) {
  return async (input: {
    readonly tenantId: string;
    readonly subscriptionId: string;
    readonly resource: string;
  }): Promise<AzureArmTokenResult> => {
    const accountRaw = await commandRunner('az', [
      'account',
      'show',
      '--subscription',
      input.subscriptionId,
      '--output',
      'json',
    ]);
    const account = parseJson(accountRaw.stdout, 'Azure CLI account response');
    const accountTenantId = readStringProperty(account, ['tenantId']);
    const accountSubscriptionId = readStringProperty(account, ['id', 'subscriptionId']);
    if (accountTenantId.toLowerCase() !== input.tenantId.toLowerCase()) {
      throw new Error('Azure CLI account tenant does not match configured tenant');
    }
    if (accountSubscriptionId.toLowerCase() !== input.subscriptionId.toLowerCase()) {
      throw new Error('Azure CLI account subscription does not match configured subscription');
    }

    const tokenRaw = await commandRunner('az', [
      'account',
      'get-access-token',
      '--subscription',
      input.subscriptionId,
      '--resource',
      input.resource,
      '--output',
      'json',
    ]);
    const parsedToken = parseJson(tokenRaw.stdout, 'Azure CLI token response');
    const accessToken = readStringProperty(parsedToken, ['accessToken']);
    const tokenTenant = readOptionalStringProperty(parsedToken, ['tenant', 'tenantId']);
    if (tokenTenant && tokenTenant.toLowerCase() !== input.tenantId.toLowerCase()) {
      throw new Error('Azure CLI token tenant does not match configured tenant');
    }
    const tokenSubscription = readOptionalStringProperty(parsedToken, ['subscription', 'subscriptionId']);
    if (tokenSubscription && tokenSubscription.toLowerCase() !== input.subscriptionId.toLowerCase()) {
      throw new Error('Azure CLI token subscription does not match configured subscription');
    }
    const expiresOnCandidate = parsedToken.expiresOn;
    if (expiresOnCandidate !== undefined && typeof expiresOnCandidate !== 'string' && typeof expiresOnCandidate !== 'number') {
      throw new Error('Azure CLI token response has invalid expiresOn');
    }
    const expiresOn = typeof expiresOnCandidate === 'string' || typeof expiresOnCandidate === 'number'
      ? expiresOnCandidate
      : undefined;
    return {
      accessToken,
      expiresOn,
    };
  };
}

async function defaultCommandRunner(file: string, args: readonly string[]): Promise<{ readonly stdout: string }> {
  const result = await execFile(file, args);
  return {
    stdout: result.stdout,
  };
}

function defaultRequestFactory(
  options: AzureArmRequestFactoryOptions,
  onResponse: (response: AzureArmIncomingMessageLike) => void,
): AzureArmClientRequestLike {
  return httpsRequest(options, onResponse);
}

function defaultFetch(requestFactory: AzureArmTransportDependencies['requestFactory']) {
  return async (url: string, init: AzureArmFetchInit): Promise<AzureArmFetchResponse> => {
    if (init.body !== undefined && typeof init.body !== 'string') {
      throw new Error('Only string request bodies are supported');
    }
    const parsedUrl = new URL(url);
    const options: AzureArmRequestFactoryOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port.length > 0 ? Number(parsedUrl.port) : undefined,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: init.method,
      headers: init.headers,
    };

    return await new Promise<AzureArmFetchResponse>((resolve, reject) => {
      let settled = false;
      const request = requestFactory(options, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        response.on('error', error => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
        response.on('end', () => {
          if (settled) {
            return;
          }
          settled = true;
          const headers = toHeaders(response.headers);
          const textValue = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode ?? 0,
            headers,
            text: async () => textValue,
          });
        });
      });

      const abortWithSignal = () => {
        const abortError = new DOMException('The operation was aborted', 'AbortError');
        request.destroy(abortError);
      };

      if (init.signal) {
        if (init.signal.aborted) {
          abortWithSignal();
        } else {
          init.signal.addEventListener('abort', abortWithSignal, { once: true });
        }
      }

      request.on('error', error => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      if (init.body !== undefined) {
        request.write(init.body);
      }
      request.end();
    });
  };
}

function toHeaders(input: Readonly<Record<string, string | readonly string[] | undefined>>): Headers {
  const headers = new Headers();
  for (const [key, rawValue] of Object.entries(input)) {
    if (rawValue === undefined) {
      continue;
    }
    if (typeof rawValue === 'string') {
      headers.append(key, rawValue);
      continue;
    }
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        headers.append(key, value);
      }
      continue;
    }
  }
  return headers;
}

function validateRequest(input: {
  readonly request: AzureArmTransportRequest;
  readonly subscriptionId: string;
  readonly allowedOperations: readonly AzureArmAllowedOperation[];
  readonly maxSkipTokenLength: number;
}): ParsedRequest {
  assertNoPlaceholders(input.request.url);
  const url = new URL(input.request.url);
  if (url.protocol !== 'https:' || url.origin !== managementOrigin) {
    throw new Error(`Only ${managementOrigin} is allowed`);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('Credentials in URL are not allowed');
  }
  if (url.hash.length > 0) {
    throw new Error('URL fragments are not allowed');
  }
  assertAllowedSubscription(url.pathname, input.subscriptionId);
  const operation = matchOperation({
    method: input.request.method,
    url,
    allowedOperations: input.allowedOperations,
    maxSkipTokenLength: input.maxSkipTokenLength,
  });
  return { url, operation };
}

function assertNoPlaceholders(value: string): void {
  if (/[{}<>]/.test(value)) {
    throw new Error('Request contains unresolved placeholder');
  }
}

function assertAllowedSubscription(pathname: string, subscriptionId: string): void {
  const match = pathname.match(/^\/subscriptions\/([^/]+)(\/|$)/i);
  if (!match) {
    throw new Error('Request path must include a subscription segment');
  }
  if (match[1].toLowerCase() !== subscriptionId.toLowerCase()) {
    throw new Error('Request subscription is not allowed');
  }
}

function matchOperation(input: {
  readonly method: string;
  readonly url: URL;
  readonly allowedOperations: readonly AzureArmAllowedOperation[];
  readonly maxSkipTokenLength: number;
}): AzureArmAllowedOperation {
  if (input.method !== 'GET' && input.method !== 'PUT' && input.method !== 'POST') {
    throw new Error(`Method ${input.method} is not allowed`);
  }

  const method = input.method as AzureArmHttpMethod;
  const apiVersion = input.url.searchParams.get('api-version');
  if (!apiVersion) {
    throw new Error('api-version query parameter is required');
  }

  const operation = input.allowedOperations.find(candidate =>
    candidate.method === method
    && normalizePath(candidate.path) === normalizePath(input.url.pathname)
    && candidate.apiVersion === apiVersion,
  );
  if (!operation) {
    throw new Error(`${method} ${input.url.pathname} is not allowlisted`);
  }

  validateQueryShape(input.url, operation, input.maxSkipTokenLength);
  return operation;
}

function validateQueryShape(url: URL, operation: AzureArmAllowedOperation, maxSkipTokenLength: number): void {
  const entries = [...url.searchParams.entries()];
  const apiVersionEntries = entries.filter(([key]) => key === 'api-version');
  if (apiVersionEntries.length !== 1) {
    throw new Error('Exactly one api-version query parameter is required');
  }

  const allowedSkipKeys = new Set(['$skipToken', '$skiptoken']);
  const extras = entries.filter(([key]) => key !== 'api-version');
  if (!operation.allowSkipToken && extras.length > 0) {
    throw new Error('Query parameters beyond api-version are not allowed');
  }
  for (const [key, value] of extras) {
    if (!allowedSkipKeys.has(key)) {
      throw new Error(`Query parameter ${key} is not allowed`);
    }
    if (value.length === 0 || value.length > maxSkipTokenLength) {
      throw new Error(`Skip token length must be between 1 and ${maxSkipTokenLength}`);
    }
  }
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

async function parseResponse(response: AzureArmFetchResponse): Promise<AzureArmTransportResponse> {
  const headers = collectRelevantHeaders(response.headers);
  if (response.status === 204) {
    return { status: response.status, headers };
  }

  const text = await response.text();
  if (text.trim().length === 0) {
    return { status: response.status, headers };
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.toLowerCase().includes('application/json')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response for HTTP ${response.status}`);
    }
    return { status: response.status, headers, body: parsed };
  }
  return { status: response.status, headers, body: text };
}

function collectRelevantHeaders(headers: AzureArmFetchResponse['headers']): Readonly<Record<string, string>> {
  const relevant = new Set([
    'content-type',
    'etag',
    'location',
    'retry-after',
    'x-ms-request-id',
    'x-ms-correlation-request-id',
  ]);
  const selected: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (relevant.has(lower)) {
      selected[lower] = value;
    }
  }
  return selected;
}

function validateNextLinkIfPresent(input: {
  readonly request: AzureArmTransportRequest;
  readonly requestUrl: URL;
  readonly operation: AzureArmAllowedOperation;
  readonly maxSkipTokenLength: number;
  readonly responseBody: unknown;
}): void {
  if (input.request.method !== 'GET') {
    return;
  }
  if (!isObject(input.responseBody) || typeof input.responseBody.nextLink !== 'string') {
    return;
  }
  if (!input.operation.allowSkipToken) {
    throw new Error('nextLink returned for a request that does not allow pagination');
  }
  const nextLinkUrl = new URL(input.responseBody.nextLink);
  if (nextLinkUrl.origin !== input.requestUrl.origin) {
    throw new Error('nextLink host is not allowed');
  }
  if (normalizePath(nextLinkUrl.pathname) !== normalizePath(input.requestUrl.pathname)) {
    throw new Error('nextLink path is not allowed');
  }
  const nextApiVersion = nextLinkUrl.searchParams.get('api-version');
  if (nextApiVersion !== input.operation.apiVersion) {
    throw new Error('nextLink api-version does not match the allowlisted operation');
  }
  validateQueryShape(nextLinkUrl, input.operation, input.maxSkipTokenLength);
}

function isObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null;
}

function parseJson(raw: string, label: string): { [key: string]: unknown } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!isObject(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

function wrapTransportError(method: string, url: string, error: unknown): Error {
  const details = describeError(error);
  const message = sanitizeDiagnosticText(`${method} ${url} failed: ${details}`);
  const wrapped = new Error(message);
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}

function describeError(error: unknown): string {
  if (!isObject(error)) {
    return 'Unknown error';
  }
  const baseCode = readDiagnosticCode(error);
  const baseMessage = readDiagnosticMessage(error) ?? 'Unknown error';
  const cause = error.cause;
  if (!isObject(cause)) {
    return baseCode ? `${baseMessage} (code=${baseCode})` : baseMessage;
  }
  const causeCode = readDiagnosticCode(cause);
  const causeMessage = readDiagnosticMessage(cause) ?? 'Unknown cause';
  const base = baseCode ? `${baseMessage} (code=${baseCode})` : baseMessage;
  const causeText = causeCode ? `${causeMessage} (code=${causeCode})` : causeMessage;
  return `${base}; cause: ${causeText}`;
}

function readDiagnosticCode(source: { [key: string]: unknown }): string | undefined {
  const value = source.code;
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function readDiagnosticMessage(source: { [key: string]: unknown }): string | undefined {
  const value = source.message;
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function sanitizeDiagnosticText(text: string): string {
  return text
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/"accessToken"\s*:\s*"[^"]*"/gi, '"accessToken":"[REDACTED]"');
}

function readStringProperty(source: { [key: string]: unknown }, propertyNames: readonly string[]): string {
  for (const propertyName of propertyNames) {
    const value = source[propertyName];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  throw new Error(`Missing required string property: ${propertyNames.join(' or ')}`);
}

function readOptionalStringProperty(source: { [key: string]: unknown }, propertyNames: readonly string[]): string | undefined {
  for (const propertyName of propertyNames) {
    const value = source[propertyName];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Invalid string property: ${propertyName}`);
    }
    return value;
  }
  return undefined;
}

function parseExpiry(expiresOn: AzureArmTokenResult['expiresOn']): number | undefined {
  if (expiresOn === undefined) {
    return undefined;
  }
  if (typeof expiresOn === 'number' && Number.isFinite(expiresOn)) {
    return expiresOn > 1_000_000_000_000 ? expiresOn : expiresOn * 1000;
  }
  if (expiresOn instanceof Date) {
    return expiresOn.getTime();
  }
  if (typeof expiresOn !== 'string') {
    return undefined;
  }
  const parsed = Date.parse(expiresOn);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createAbortSignal(
  upstream: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal | undefined; cleanup: () => void } {
  if (timeoutMs <= 0 && !upstream) {
    return { signal: undefined, cleanup: () => {} };
  }
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  if (timeoutMs > 0) {
    timeout = setTimeout(() => controller.abort(new DOMException('The operation timed out', 'AbortError')), timeoutMs);
  }
  const abortFromUpstream = () => controller.abort(upstream?.reason);
  if (upstream) {
    if (upstream.aborted) {
      abortFromUpstream();
    } else {
      upstream.addEventListener('abort', abortFromUpstream, { once: true });
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (upstream) {
        upstream.removeEventListener('abort', abortFromUpstream);
      }
    },
  };
}
