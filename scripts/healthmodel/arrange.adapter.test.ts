import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { arrangeFromInput, runArrangeStdio, type ArrangeAdapterInput } from './arrange';

function testOrderingPolicy(): void {
  const input: ArrangeAdapterInput = {
    entities: [
      { id: 'root', displayName: 'Root', canvasPosition: { x: 999, y: 999 } },
      { id: 'seed-b', displayName: 'Seed B', canvasPosition: { x: 3, y: 3 } },
      { id: 'disc-a', displayName: 'Discovered A', canvasPosition: { x: 1, y: 1 } },
      { id: 'seed-a', displayName: 'Seed A', canvasPosition: { x: 2, y: 2 } },
      { id: 'disc-c', displayName: 'Discovered C', canvasPosition: { x: 0, y: 0 } },
      { id: 'disc-b', displayName: 'Discovered B', canvasPosition: { x: -1, y: -1 } },
    ],
    relationships: [
      { parentEntityName: 'root', childEntityName: 'disc-c' },
      { parentEntityName: 'root', childEntityName: 'seed-a' },
      { parentEntityName: 'root', childEntityName: 'disc-a' },
      { parentEntityName: 'root', childEntityName: 'seed-b' },
      { parentEntityName: 'root', childEntityName: 'disc-b' },
    ],
    authoredOrder: [
      { id: 'seed-b', order: 1 },
      { id: 'seed-a', order: 0 },
    ],
  };

  const output = arrangeFromInput(input);
  const byId = new Map(output.positions.map(entry => [entry.id, entry.canvasPosition]));

  assert.equal(byId.get('seed-a')?.x, 0);
  assert.equal(byId.get('seed-b')?.x, 250);
  assert.equal(byId.get('disc-a')?.x, 500);
  assert.equal(byId.get('disc-b')?.x, 750);
  assert.equal(byId.get('disc-c')?.x, 1000);
  assert.equal(byId.get('root')?.x, 500);
}

function testDeterministicAcrossShuffledInputAndDisplayRename(): void {
  const base: ArrangeAdapterInput = {
    entities: [
      { id: 'root', displayName: 'Root' },
      { id: 'left', displayName: 'Left One', canvasPosition: { x: 5000, y: 1 } },
      { id: 'right', displayName: 'Right One', canvasPosition: { x: -999, y: 9 } },
      { id: 'leaf-a', displayName: 'Leaf A' },
      { id: 'leaf-b', displayName: 'Leaf B' },
    ],
    relationships: [
      { parentEntityName: 'root', childEntityName: 'left' },
      { parentEntityName: 'root', childEntityName: 'right' },
      { parentEntityName: 'left', childEntityName: 'leaf-a' },
      { parentEntityName: 'right', childEntityName: 'leaf-b' },
    ],
    authoredOrder: [
      { id: 'left', order: 0 },
      { id: 'right', order: 1 },
    ],
  };
  const shuffled: ArrangeAdapterInput = {
    entities: [
      { id: 'leaf-b', displayName: 'renamed leaf b', canvasPosition: { x: 1, y: 2 } },
      { id: 'root', displayName: 'renamed root' },
      { id: 'right', displayName: 'renamed right', canvasPosition: { x: 3, y: 4 } },
      { id: 'leaf-a', displayName: 'renamed leaf a', canvasPosition: { x: 5, y: 6 } },
      { id: 'left', displayName: 'renamed left', canvasPosition: { x: 7, y: 8 } },
    ],
    relationships: [
      { parentEntityName: 'right', childEntityName: 'leaf-b' },
      { parentEntityName: 'left', childEntityName: 'leaf-a' },
      { parentEntityName: 'root', childEntityName: 'right' },
      { parentEntityName: 'root', childEntityName: 'left' },
    ],
    authoredOrder: [
      { id: 'right', order: 1 },
      { id: 'left', order: 0 },
    ],
  };

  const first = arrangeFromInput(base);
  const second = arrangeFromInput(shuffled);

  assert.deepEqual(first.positions, second.positions);
  assert.deepEqual(first.orderedIds, second.orderedIds);
}

function testAdapterErrorCases(): void {
  const cases: Array<{ name: string; input: ArrangeAdapterInput; expected: RegExp }> = [
    {
      name: 'missing-endpoint',
      input: {
        entities: [{ id: 'root' }],
        relationships: [{ parentEntityName: 'root', childEntityName: 'ghost' }],
      },
      expected: /Missing child endpoint/,
    },
    {
      name: 'multiple-parents',
      input: {
        entities: [{ id: 'root' }, { id: 'a' }, { id: 'b' }, { id: 'child' }],
        relationships: [
          { parentEntityName: 'a', childEntityName: 'child' },
          { parentEntityName: 'b', childEntityName: 'child' },
        ],
      },
      expected: /Multiple parents/,
    },
    {
      name: 'invalid-id',
      input: {
        entities: [{ id: ' ' }],
        relationships: [],
      },
      expected: /Invalid entity id/,
    },
  ];

  for (const scenario of cases) {
    assert.throws(() => arrangeFromInput(scenario.input), scenario.expected, scenario.name);
  }
}

function testStdioContract(): void {
  const input: ArrangeAdapterInput = {
    entities: [{ id: 'root' }, { id: 'leaf' }],
    relationships: [{ parentEntityName: 'root', childEntityName: 'leaf' }],
  };
  const rawOutput = runArrangeStdio(JSON.stringify(input));
  const parsed = JSON.parse(rawOutput);

  assert.equal(typeof parsed.meta.leafPitch, 'number');
  assert.equal(typeof parsed.meta.rankPitch, 'number');
  assert.ok(Array.isArray(parsed.positions));
  assert.ok(Array.isArray(parsed.orderedIds));
  assert.equal(parsed.positions.length, 2);
}

function testCliContract(): void {
  const input: ArrangeAdapterInput = {
    entities: [{ id: 'root' }, { id: 'leaf' }],
    relationships: [{ parentEntityName: 'root', childEntityName: 'leaf' }],
  };
  const command = spawnSync(
    'node',
    ['-r', 'ts-node/register', 'arrange.ts'],
    {
      cwd: __dirname,
      input: JSON.stringify(input),
      encoding: 'utf8',
    },
  );
  assert.equal(command.status, 0, command.stderr);
  const parsed = JSON.parse(command.stdout);
  assert.deepEqual(parsed.meta, { leafPitch: 250, rankPitch: 193 });
  assert.equal(parsed.positions.length, 2);
}

testOrderingPolicy();
testDeterministicAcrossShuffledInputAndDisplayRename();
testAdapterErrorCases();
testStdioContract();
testCliContract();

console.log('arrange.adapter.test.ts: ok');
