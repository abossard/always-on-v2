import assert from 'node:assert/strict';
import { buildAllPlatformsModelBicep, buildAppModelBicep, buildPlatformModelBicep } from './builder';
import * as signals from './signals';

type TestCase = {
  name: string;
  run: () => void;
};

const testCases: TestCase[] = [
  {
    name: 'uses stable CloudHealth API version in all generated modules',
    run: () => {
      const outputs = [
        buildPlatformModelBicep(),
        buildAllPlatformsModelBicep(),
        buildAppModelBicep(),
      ];
      for (const output of outputs) {
        assert.match(output, /@2026-11-01\b/);
        assert.doesNotMatch(output, /@2026-01-01-preview\b/);
      }
    },
  },
  {
    name: 'emits full dimensionFilter predicates and no legacy dimension field',
    run: () => {
      const dimensions = [
        { name: 'aksFailedPods', signal: signals.aksFailedPods(), expectedFilter: "phase eq 'Failed'" },
        { name: 'fdRequestCount4xx', signal: signals.fdRequestCount4xx(), expectedFilter: "HttpStatusGroup eq '4XX'" },
        { name: 'cosmosClientErrors', signal: signals.cosmosClientErrors(), expectedFilter: "Status eq 'ClientOtherError'" },
        { name: 'cosmosThrottled', signal: signals.cosmosThrottled(), expectedFilter: "StatusCode eq '429'" },
        { name: 'queueTransactionErrors', signal: signals.queueTransactionErrors(), expectedFilter: "ResponseType eq 'ClientOtherError'" },
        { name: 'blobTransactionErrors', signal: signals.blobTransactionErrors(), expectedFilter: "ResponseType eq 'ClientOtherError'" },
        { name: 'cosmosServerErrors', signal: signals.cosmosServerErrors(), expectedFilter: "StatusCode eq '500'" },
      ];

      for (const dimension of dimensions) {
        assert.equal(dimension.signal.dimensionFilter, dimension.expectedFilter, dimension.name);
        assert.equal('dimension' in dimension.signal, false, `${dimension.name} still includes dimension`);
      }
    },
  },
  {
    name: 'builds and validates Front Door origin filter with normalized port and escaping',
    run: () => {
      assert.equal(signals.fdOriginLatency('darkux-eastus2-001.eastus2.alwayson.actor').dimensionFilter, "Origin eq 'darkux-eastus2-001.eastus2.alwayson.actor:443'");
      assert.equal(signals.fdOriginLatency('darkux-eastus2-001.eastus2.alwayson.actor:443').dimensionFilter, "Origin eq 'darkux-eastus2-001.eastus2.alwayson.actor:443'");
      assert.equal(signals.fdOriginLatency("edge'o").dimensionFilter, "Origin eq 'edge''o:443'");
      assert.equal(signals.fdOriginLatency("edge'o:443").dimensionFilter, "Origin eq 'edge''o:443'");
      assert.equal(signals.fdOriginLatency('a'.repeat(253)).dimensionFilter, `Origin eq '${'a'.repeat(253)}:443'`);
      assert.throws(() => signals.fdOriginLatency(''), /between 1 and 253/);
      assert.throws(() => signals.fdOriginLatency('a'.repeat(254)), /between 1 and 253/);

      const app = buildAppModelBicep();
      assert.match(app, /endsWith\(toLower\(stamp\.originHostname\), ':443'\)/);
      assert.match(app, /format\('Origin eq \\'\{0\}\\''/);
      assert.match(app, /format\('Origin eq \\'\{0\}:443\\''/);
      assert.match(app, /replace\(stamp\.originHostname,/);
      assert.match(app, /@minLength\(1\)\s+@maxLength\(257\)\s+originHostname: string/);
      assert.match(app, /param stamps stampInput\[\]/);
    },
  },
  {
    name: 'preserves discovery addResourceHealthSignal as Disabled',
    run: () => {
      const allPlatforms = buildAllPlatformsModelBicep();
      assert.match(allPlatforms, /addResourceHealthSignal:\s*'Disabled'/);
    },
  },
  {
    name: 'groups platform leaves under Networking, Compute, and Persistancy user flows',
    run: () => {
      const platform = buildPlatformModelBicep();

      for (const flowSeed of ['system-flow-networking', 'system-flow-compute', 'system-flow-persistancy']) {
        assert.match(platform, new RegExp(`guid\\(name, '${flowSeed}'\\)`));
      }

      for (const flowSymbol of ['eFlowNetworking', 'eFlowCompute', 'eFlowPersistancy']) {
        assert.match(platform, new RegExp(`resource ${flowSymbol} 'Microsoft\\.CloudHealth/healthmodels/entities@2026-11-01'`));
      }

      const flowMemberships: Array<[string, string]> = [
        ['eFlowNetworking', 'eNetworking'],
        ['eFlowNetworking', 'eCerts'],
        ['eFlowCompute', 'eNodeCapacity'],
        ['eFlowCompute', 'eNodePressure'],
        ['eFlowCompute', 'eKubeSystem'],
        ['eFlowCompute', 'eAks'],
        ['eFlowCompute', 'eNodes'],
        ['eFlowCompute', 'eControlPlane'],
        ['eFlowCompute', 'eLifecycle'],
        ['eFlowPersistancy', 'eStampCosmos'],
      ];

      for (const [parent, child] of flowMemberships) {
        assert.match(
          platform,
          new RegExp(`parentEntityName:\\s*${parent}\\.name[\\s\\S]*childEntityName:\\s*${child}\\.name`),
          `${parent} -> ${child}`,
        );
      }
    },
  },
  {
    name: 'removes em dash from generated healthmodel display strings',
    run: () => {
      const outputs = [
        buildPlatformModelBicep(),
        buildAllPlatformsModelBicep(),
        buildAppModelBicep(),
      ];
      for (const output of outputs) {
        const displayNameLines = output
          .split('\n')
          .filter(line => line.includes('displayName:'));
        for (const line of displayNameLines) {
          assert.doesNotMatch(line, /—/u);
        }
      }
    },
  },
];

let failures = 0;
for (const testCase of testCases) {
  try {
    testCase.run();
    console.log(`PASS: ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL: ${testCase.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exit(1);
}
