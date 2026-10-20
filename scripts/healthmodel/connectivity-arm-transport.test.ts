import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createAzureArmTransport,
  type AzureArmAllowedOperation,
  type AzureArmRequestFactoryOptions,
  type AzureArmIncomingMessageLike,
  type AzureArmClientRequestLike,
  type AzureArmTransportDependencies,
  type AzureArmTransportRequest,
} from './connectivity-arm-transport';

const subscriptionId = '00000000-0000-0000-0000-000000000000';
const tenantId = '11111111-1111-1111-1111-111111111111';

const allowedOperations: readonly AzureArmAllowedOperation[] = [
  {
    method: 'GET',
    path: `/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities`,
    apiVersion: '2026-11-01',
    allowSkipToken: true,
  },
  {
    method: 'PUT',
    path: `/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo`,
    apiVersion: '2026-11-01',
  },
  {
    method: 'POST',
    path: `/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities/entity-a/ingestHealthReport`,
    apiVersion: '2026-11-01',
  },
] as const;

class FakeIncomingMessage extends EventEmitter implements AzureArmIncomingMessageLike {
  constructor(
    readonly statusCode: number,
    readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  ) {
    super();
  }
}

class FakeClientRequest extends EventEmitter implements AzureArmClientRequestLike {
  writtenBody = '';
  destroyedWith: Error | undefined;

  write(chunk: string): void {
    this.writtenBody += chunk;
  }

  end(): void {}

  destroy(error?: Error): void {
    this.destroyedWith = error;
    if (error) {
      this.emit('error', error);
    }
  }
}

function createDeps(overrides?: Partial<AzureArmTransportDependencies>) {
  const state = {
    tokenCalls: 0,
    fetchCalls: 0,
    authHeader: '',
    lastUrl: '',
    lastBody: '',
    lastMethod: '',
  };

  const deps: AzureArmTransportDependencies = {
    now: () => Date.now(),
    requestFactory: () => {
      throw new Error('requestFactory not configured');
    },
    commandRunner: async () => ({ stdout: '' }),
    tokenProvider: async () => {
      state.tokenCalls += 1;
      return {
        accessToken: 'fake-token',
        expiresOn: new Date(Date.now() + 60_000).toISOString(),
      };
    },
    fetch: async (url, init) => {
      state.fetchCalls += 1;
      state.lastUrl = url;
      state.lastMethod = init.method ?? '';
      state.authHeader = String(init.headers?.Authorization ?? '');
      state.lastBody = typeof init.body === 'string' ? init.body : '';
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    },
    ...overrides,
  };

  return { deps, state };
}

async function testUnauthorizedRequestsPerformZeroIo(): Promise<void> {
  const cases: ReadonlyArray<AzureArmTransportRequest> = [
    {
      method: 'POST',
      url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
    },
    {
      method: 'GET',
      url: `https://example.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
    },
    {
      method: 'GET',
      url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/not-allowlisted?api-version=2026-11-01`,
    },
    {
      method: 'GET',
      url: 'https://management.azure.com/subscriptions/{subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01',
    },
    {
      method: 'GET',
      url: `https://management.azure.com/subscriptions/99999999-9999-9999-9999-999999999999/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
    },
  ];

  for (const request of cases) {
    const { deps, state } = createDeps();
    const transport = createAzureArmTransport({
      subscriptionId,
      tenantId,
      allowedOperations,
      dependencies: deps,
    });
    await assert.rejects(() => transport.execute(request), /not allowlisted|management\.azure\.com|placeholder|subscription/i);
    assert.equal(state.tokenCalls, 0);
    assert.equal(state.fetchCalls, 0);
  }
}

async function testWritesDeniedByDefault(): Promise<void> {
  const { deps, state } = createDeps();
  const transport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations: allowedOperations.filter(operation => operation.method === 'GET'),
    dependencies: deps,
  });
  await assert.rejects(
    () =>
      transport.execute({
        method: 'PUT',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo?api-version=2026-11-01`,
      }),
    /not allowlisted/i,
  );
  assert.equal(state.tokenCalls, 0);
  assert.equal(state.fetchCalls, 0);
}

async function testValidGetPutPostUseTokenAndFetch(): Promise<void> {
  const cases: ReadonlyArray<{ request: AzureArmTransportRequest; expectedBody?: unknown }> = [
    {
      request: {
        method: 'GET',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
      },
    },
    {
      request: {
        method: 'PUT',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo?api-version=2026-11-01`,
        body: { properties: { displayName: 'demo' } },
      },
      expectedBody: { properties: { displayName: 'demo' } },
    },
    {
      request: {
        method: 'POST',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities/entity-a/ingestHealthReport?api-version=2026-11-01`,
        body: { healthState: 'Healthy' },
      },
      expectedBody: { healthState: 'Healthy' },
    },
  ];

  for (const testCase of cases) {
    const { deps, state } = createDeps();
    const transport = createAzureArmTransport({
      subscriptionId,
      tenantId,
      allowedOperations,
      dependencies: deps,
    });
    const response = await transport.execute(testCase.request);
    assert.equal(response.status, 200);
    assert.equal(state.tokenCalls, 1);
    assert.equal(state.fetchCalls, 1);
    assert.equal(state.lastUrl, testCase.request.url);
    assert.equal(state.lastMethod, testCase.request.method);
    assert.match(state.authHeader, /^Bearer /);
    if (testCase.expectedBody) {
      assert.deepEqual(JSON.parse(state.lastBody), testCase.expectedBody);
    } else {
      assert.equal(state.lastBody, '');
    }
  }
}

async function testDefaultTokenProviderBuildsExpectedCommands(): Promise<void> {
  const commands: Array<{ file: string; args: readonly string[] }> = [];
  let fetchCalls = 0;
  const transport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: {
      now: () => Date.now(),
      fetch: async () => {
        fetchCalls += 1;
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
      commandRunner: async (file, args) => {
        commands.push({ file, args });
        if (args[0] === 'account' && args[1] === 'show') {
          return { stdout: JSON.stringify({ tenantId, id: subscriptionId }) };
        }
        if (args[0] === 'account' && args[1] === 'get-access-token') {
          return {
            stdout: JSON.stringify({
              accessToken: 'token-value',
              expiresOn: new Date(Date.now() + 60_000).toISOString(),
              tenant: tenantId,
              subscription: subscriptionId,
            }),
          };
        }
        throw new Error('unexpected command');
      },
    },
  });

  await transport.execute({
    method: 'GET',
    url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
  });

  assert.equal(fetchCalls, 1);
  assert.equal(commands.length, 2);
  assert.equal(commands[0].file, 'az');
  assert.deepEqual(commands[0].args, [
    'account',
    'show',
    '--subscription',
    subscriptionId,
    '--output',
    'json',
  ]);
  assert.equal(commands[1].file, 'az');
  assert.deepEqual(commands[1].args, [
    'account',
    'get-access-token',
    '--subscription',
    subscriptionId,
    '--resource',
    'https://management.azure.com/',
    '--output',
    'json',
  ]);
  assert.ok(!commands[1].args.includes('--tenant'));
}

async function testDefaultTokenProviderRejectsMismatchedAccountTenantBeforeTokenFetch(): Promise<void> {
  const commands: Array<{ file: string; args: readonly string[] }> = [];
  let fetchCalls = 0;
  const transport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: {
      now: () => Date.now(),
      fetch: async () => {
        fetchCalls += 1;
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
      commandRunner: async (file, args) => {
        commands.push({ file, args });
        if (args[0] === 'account' && args[1] === 'show') {
          return { stdout: JSON.stringify({ tenantId: '99999999-9999-9999-9999-999999999999', id: subscriptionId }) };
        }
        return { stdout: '{}' };
      },
    },
  });

  await assert.rejects(
    () =>
      transport.execute({
        method: 'GET',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
      }),
    /account tenant does not match/i,
  );
  assert.equal(commands.length, 1);
  assert.equal(fetchCalls, 0);
}

async function testDefaultTokenProviderRejectsMalformedOrMismatchedTokenMetadata(): Promise<void> {
  const cases = [
    {
      name: 'tenant mismatch',
      tokenPayload: { accessToken: 'token', tenant: '99999999-9999-9999-9999-999999999999', subscription: subscriptionId },
      errorPattern: /token tenant does not match/i,
    },
    {
      name: 'subscription mismatch',
      tokenPayload: { accessToken: 'token', tenant: tenantId, subscription: '99999999-9999-9999-9999-999999999999' },
      errorPattern: /token subscription does not match/i,
    },
    {
      name: 'invalid expiresOn',
      tokenPayload: { accessToken: 'token', tenant: tenantId, subscription: subscriptionId, expiresOn: { bad: true } },
      errorPattern: /invalid expiresOn/i,
    },
  ] as const;

  for (const testCase of cases) {
    let fetchCalls = 0;
    const commands: Array<readonly string[]> = [];
    const transport = createAzureArmTransport({
      subscriptionId,
      tenantId,
      allowedOperations,
      dependencies: {
        now: () => Date.now(),
        fetch: async () => {
          fetchCalls += 1;
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
        },
        commandRunner: async (_file, args) => {
          commands.push(args);
          if (args[1] === 'show') {
            return { stdout: JSON.stringify({ tenantId, id: subscriptionId }) };
          }
          return { stdout: JSON.stringify(testCase.tokenPayload) };
        },
      },
    });

    await assert.rejects(
      () =>
        transport.execute({
          method: 'GET',
          url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
        }),
      testCase.errorPattern,
      testCase.name,
    );
    assert.equal(commands.length, 2);
    assert.equal(fetchCalls, 0);
  }
}

async function testDefaultHttpsBackendUsesRequestFactoryAndPreservesStatusHeadersBody(): Promise<void> {
  const captured: {
    options?: AzureArmRequestFactoryOptions;
    request?: FakeClientRequest;
  } = {};
  const transport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: {
      now: () => Date.now(),
      commandRunner: async () => ({ stdout: '{}' }),
      tokenProvider: async () => ({ accessToken: 'fake-token' }),
      requestFactory: (options, onResponse) => {
        captured.options = options;
        const request = new FakeClientRequest();
        captured.request = request;
        request.end = () => {
          const response = new FakeIncomingMessage(202, {
            'content-type': 'application/json',
            'x-ms-request-id': 'req-123',
          });
          onResponse(response);
          response.emit('data', JSON.stringify({ ok: true }));
          response.emit('end');
        };
        return request;
      },
    },
  });

  const result = await transport.execute({
    method: 'POST',
    url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities/entity-a/ingestHealthReport?api-version=2026-11-01`,
    body: { healthState: 'Healthy' },
  });

  assert.equal(result.status, 202);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.headers['x-ms-request-id'], 'req-123');
  assert.equal(captured.options?.protocol, 'https:');
  assert.equal(captured.options?.hostname, 'management.azure.com');
  assert.equal(captured.options?.method, 'POST');
  assert.equal(
    captured.options?.path,
    `/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities/entity-a/ingestHealthReport?api-version=2026-11-01`,
  );
  assert.equal(captured.options?.headers.Authorization, 'Bearer fake-token');
  assert.equal(captured.options?.headers['Content-Type'], 'application/json');
  assert.equal(captured.request?.writtenBody, JSON.stringify({ healthState: 'Healthy' }));
}

async function testDefaultHttpsBackendHonorsAbortAndTimeout(): Promise<void> {
  let capturedRequest: FakeClientRequest | undefined;
  const transport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    timeoutMs: 25,
    dependencies: {
      now: () => Date.now(),
      commandRunner: async () => ({ stdout: '{}' }),
      tokenProvider: async () => ({ accessToken: 'fake-token' }),
      requestFactory: () => {
        const request = new FakeClientRequest();
        capturedRequest = request;
        return request;
      },
    },
  });

  await assert.rejects(
    () =>
      transport.execute({
        method: 'GET',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
      }),
    /AbortError|aborted/i,
  );
  assert.ok(capturedRequest?.destroyedWith instanceof Error);
}

async function testReturnsNon2xxAnd204WithoutFallback(): Promise<void> {
  const { deps } = createDeps({
    fetch: async () =>
      new Response(JSON.stringify({ error: { code: 'BadRequest', message: 'bad input' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
  });
  const transport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: deps,
  });

  const errorResponse = await transport.execute({
    method: 'GET',
    url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
  });

  assert.equal(errorResponse.status, 400);
  assert.deepEqual(errorResponse.body, { error: { code: 'BadRequest', message: 'bad input' } });

  const { deps: emptyDeps } = createDeps({
    fetch: async () =>
      new Response(null, {
        status: 204,
      }),
  });
  const emptyTransport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: emptyDeps,
  });

  const empty = await emptyTransport.execute({
    method: 'GET',
    url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
  });
  assert.equal(empty.status, 204);
  assert.equal(empty.body, undefined);
}

async function testRejectsRedirectAndMalformedJson(): Promise<void> {
  const redirectTransport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: createDeps({
      fetch: async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid/' } }),
    }).deps,
  });

  await assert.rejects(
    () =>
      redirectTransport.execute({
        method: 'GET',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
      }),
    /redirect/i,
  );

  const malformedTransport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: createDeps({
      fetch: async () =>
        new Response('{ invalid', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    }).deps,
  });

  await assert.rejects(
    () =>
      malformedTransport.execute({
        method: 'GET',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
      }),
    /json/i,
  );
}

async function testPaginationValidationAndTimeout(): Promise<void> {
  const paginationTransport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: createDeps({
      fetch: async () =>
        new Response(
          JSON.stringify({
            value: [],
            nextLink: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01&$skipToken=abc123`,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    }).deps,
  });

  const response = await paginationTransport.execute({
    method: 'GET',
    url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
  });
  assert.equal(response.status, 200);

  const arbitraryNextLinkTransport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: createDeps({
      fetch: async () =>
        new Response(
          JSON.stringify({
            nextLink: 'https://management.azure.com/subscriptions/other/resourceGroups/rg/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    }).deps,
  });
  await assert.rejects(
    () =>
      arbitraryNextLinkTransport.execute({
        method: 'GET',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
      }),
    /nextLink|subscription/i,
  );

  const timeoutTransport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    timeoutMs: 25,
    dependencies: createDeps({
      fetch: async (_url, init) => {
        await delay(100);
        if (init.signal?.aborted) {
          throw new DOMException('aborted', 'AbortError');
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    }).deps,
  });
  await assert.rejects(
    () =>
      timeoutTransport.execute({
        method: 'GET',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
      }),
    /AbortError|aborted/i,
  );
}

async function testFetchFailurePreservesSanitizedRequestAndCause(): Promise<void> {
  const networkCause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  const networkError = new TypeError('fetch failed') as TypeError & { cause?: unknown };
  networkError.cause = networkCause;
  let capturedOptions: AzureArmRequestFactoryOptions | undefined;

  const transport = createAzureArmTransport({
    subscriptionId,
    tenantId,
    allowedOperations,
    dependencies: {
      now: () => Date.now(),
      commandRunner: async () => ({ stdout: '{}' }),
      tokenProvider: async () => ({ accessToken: 'fake-token' }),
      requestFactory: options => {
        capturedOptions = options;
        const request = new FakeClientRequest();
        request.end = () => {
          request.emit('error', networkError);
        };
        return request;
      },
    },
  });

  await assert.rejects(
    () =>
      transport.execute({
        method: 'GET',
        url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/rg-test/providers/Microsoft.CloudHealth/healthmodels/hm-demo/entities?api-version=2026-11-01`,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^GET https:\/\/management\.azure\.com\//);
      assert.match(error.message, /fetch failed/i);
      assert.match(error.message, /ECONNRESET/i);
      assert.match(error.message, /socket hang up/i);
      assert.doesNotMatch(error.message, /fake-token/i);
      assert.equal((error as Error & { cause?: unknown }).cause, networkError);
      return true;
    },
  );
  assert.equal(capturedOptions?.hostname, 'management.azure.com');
  assert.equal(capturedOptions?.method, 'GET');
}

const tests = [
  ['unauthorized requests perform zero token/fetch I/O', testUnauthorizedRequestsPerformZeroIo],
  ['writes denied by default', testWritesDeniedByDefault],
  ['valid GET/PUT/POST use intended URL, body, and Authorization', testValidGetPutPostUseTokenAndFetch],
  ['default provider builds az commands without tenant on token call', testDefaultTokenProviderBuildsExpectedCommands],
  ['default provider rejects mismatched account tenant before token/fetch', testDefaultTokenProviderRejectsMismatchedAccountTenantBeforeTokenFetch],
  ['default provider rejects malformed or mismatched token metadata', testDefaultTokenProviderRejectsMalformedOrMismatchedTokenMetadata],
  ['default https backend preserves options, status, headers, and body', testDefaultHttpsBackendUsesRequestFactoryAndPreservesStatusHeadersBody],
  ['default https backend honors abort/timeout', testDefaultHttpsBackendHonorsAbortAndTimeout],
  ['non-2xx and 204 responses are returned without success fallback', testReturnsNon2xxAnd204WithoutFallback],
  ['redirect and malformed JSON are rejected', testRejectsRedirectAndMalformedJson],
  ['pagination and timeout behavior are enforced', testPaginationValidationAndTimeout],
  ['fetch failures include sanitized request and cause diagnostics', testFetchFailurePreservesSanitizedRequestAndCause],
] as const;

async function run(): Promise<void> {
  let failures = 0;
  for (const [name, test] of tests) {
    try {
      await test();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL: ${name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
