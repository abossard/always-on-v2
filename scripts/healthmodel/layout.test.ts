import assert from 'node:assert/strict';
import { arrangeTree, TREE_LEAF_PITCH, TREE_RANK_PITCH, type LayoutNode } from './layout';

function childrenOf(nodes: readonly LayoutNode[], parentId: string): LayoutNode[] {
  return nodes
    .filter(node => node.parentId === parentId)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

function assertMinHorizontalSpacing(nodes: readonly LayoutNode[], minSpacing: number): void {
  const positions = arrangeTree(nodes).positions;
  const rows = new Map<number, number[]>();
  for (const { x, y } of Object.values(positions)) {
    const xs = rows.get(y) ?? [];
    xs.push(x);
    rows.set(y, xs);
  }
  for (const xs of rows.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i] - xs[i - 1] >= minSpacing, `Expected spacing >= ${minSpacing}, got ${xs[i] - xs[i - 1]}`);
    }
  }
}

function testCalibrationAgainstDarkuxSnapshot(): void {
  const edges = [
    ['hm-darkux', '3a85f1bb-cf33-551d-b1a9-e4dc448b5aa3'],
    ['d311871e-e730-5d44-9b43-9d26ef76e5ca', 'cfbe6e58-52bf-595b-9bc8-46ac400edf64'],
    ['3a85f1bb-cf33-551d-b1a9-e4dc448b5aa3', '7bac3c25-400d-57e7-85d1-9a4cd1c34400'],
    ['cb85727b-894f-567d-af24-b1b8a57c8f8d', '839017c7-73e7-5673-bb5c-a211a07a1e3c'],
    ['3a85f1bb-cf33-551d-b1a9-e4dc448b5aa3', '000572cd-997a-5b00-8925-e6730bab48ee'],
    ['da738372-1eca-59b6-be9d-605c38f6bc13', '17a34a36-48dd-59e7-b489-a19cf0d87a29'],
    ['hm-darkux', 'd311871e-e730-5d44-9b43-9d26ef76e5ca'],
    ['3a85f1bb-cf33-551d-b1a9-e4dc448b5aa3', 'febc2e25-78e7-58fc-b703-f915efdbfdc7'],
    ['hm-darkux', 'cb85727b-894f-567d-af24-b1b8a57c8f8d'],
    ['d311871e-e730-5d44-9b43-9d26ef76e5ca', '8487feb4-bb51-5d15-a243-1eae5f0b9520'],
    ['3a85f1bb-cf33-551d-b1a9-e4dc448b5aa3', '07f718f4-b332-56cd-8eba-a7c8e2b02614'],
    ['3a85f1bb-cf33-551d-b1a9-e4dc448b5aa3', 'a44bb824-84ce-55f5-adab-c78e40bb7f5e'],
    ['da738372-1eca-59b6-be9d-605c38f6bc13', '4629b653-950b-5734-aa59-f09d008e34e5'],
    ['3a85f1bb-cf33-551d-b1a9-e4dc448b5aa3', 'b638914f-7be6-521d-b346-07d605afcfa0'],
    ['36039ebc-4bd1-5381-8dfc-4d267d96e8d8', 'c456ad01-0e2f-55e4-afa8-6b28e4d0c375'],
    ['hm-darkux', '36039ebc-4bd1-5381-8dfc-4d267d96e8d8'],
    ['36039ebc-4bd1-5381-8dfc-4d267d96e8d8', 'f4e2ec34-c807-55ca-837b-13b5b136b8c5'],
    ['cb85727b-894f-567d-af24-b1b8a57c8f8d', '683cfead-26d7-519b-b727-169de58640f2'],
    ['3a85f1bb-cf33-551d-b1a9-e4dc448b5aa3', 'e8803ea6-ce66-5da4-9cb0-c3ed1282862f'],
    ['hm-darkux', 'da738372-1eca-59b6-be9d-605c38f6bc13'],
  ] as const;

  const expected = new Map<string, { x: number; y: number }>([
    ['hm-darkux', { x: 1125, y: 0 }],
    ['da738372-1eca-59b6-be9d-605c38f6bc13', { x: 125, y: 193 }],
    ['36039ebc-4bd1-5381-8dfc-4d267d96e8d8', { x: 625, y: 193 }],
    ['cb85727b-894f-567d-af24-b1b8a57c8f8d', { x: 1125, y: 193 }],
    ['d311871e-e730-5d44-9b43-9d26ef76e5ca', { x: 1625, y: 193 }],
    ['3a85f1bb-cf33-551d-b1a9-e4dc448b5aa3', { x: 2750, y: 193 }],
    ['4629b653-950b-5734-aa59-f09d008e34e5', { x: 0, y: 386 }],
    ['17a34a36-48dd-59e7-b489-a19cf0d87a29', { x: 250, y: 386 }],
    ['f4e2ec34-c807-55ca-837b-13b5b136b8c5', { x: 500, y: 386 }],
    ['c456ad01-0e2f-55e4-afa8-6b28e4d0c375', { x: 750, y: 386 }],
    ['683cfead-26d7-519b-b727-169de58640f2', { x: 1000, y: 386 }],
    ['839017c7-73e7-5673-bb5c-a211a07a1e3c', { x: 1250, y: 386 }],
    ['8487feb4-bb51-5d15-a243-1eae5f0b9520', { x: 1500, y: 386 }],
    ['cfbe6e58-52bf-595b-9bc8-46ac400edf64', { x: 1750, y: 386 }],
    ['e8803ea6-ce66-5da4-9cb0-c3ed1282862f', { x: 2000, y: 386 }],
    ['b638914f-7be6-521d-b346-07d605afcfa0', { x: 2250, y: 386 }],
    ['a44bb824-84ce-55f5-adab-c78e40bb7f5e', { x: 2500, y: 386 }],
    ['07f718f4-b332-56cd-8eba-a7c8e2b02614', { x: 2750, y: 386 }],
    ['febc2e25-78e7-58fc-b703-f915efdbfdc7', { x: 3000, y: 386 }],
    ['000572cd-997a-5b00-8925-e6730bab48ee', { x: 3250, y: 386 }],
    ['7bac3c25-400d-57e7-85d1-9a4cd1c34400', { x: 3500, y: 386 }],
  ]);

  const allIds = new Set<string>();
  for (const [parent, child] of edges) {
    allIds.add(parent);
    allIds.add(child);
  }

  const childrenByParent = new Map<string, string[]>();
  for (const [parent, child] of edges) {
    const siblings = childrenByParent.get(parent) ?? [];
    siblings.push(child);
    childrenByParent.set(parent, siblings);
  }

  const nodes: LayoutNode[] = [];
  for (const id of allIds) {
    const parentEdge = edges.find(([, child]) => child === id);
    const parentId = parentEdge ? parentEdge[0] : null;
    let order = 0;
    if (parentId !== null) {
      const siblings = (childrenByParent.get(parentId) ?? [])
        .slice()
        .sort((a, b) => {
          const ax = expected.get(a)?.x ?? Number.MAX_SAFE_INTEGER;
          const bx = expected.get(b)?.x ?? Number.MAX_SAFE_INTEGER;
          return ax !== bx ? ax - bx : a.localeCompare(b);
        });
      order = siblings.indexOf(id);
    }
    nodes.push({ id, parentId, order });
  }

  const { positions } = arrangeTree(nodes);
  assert.equal(Object.keys(positions).length, 21);
  for (const [id, point] of expected.entries()) {
    const actual = positions[id];
    assert.ok(actual, `Missing coordinate for ${id}`);
    assert.ok(Math.abs(actual.x - point.x) <= 0.5, `${id} x mismatch: ${actual.x} vs ${point.x}`);
    assert.ok(Math.abs(actual.y - point.y) <= 0.5, `${id} y mismatch: ${actual.y} vs ${point.y}`);
  }
}

function testTopologyCoverage(): void {
  const cases: Array<{ name: string; nodes: LayoutNode[] }> = [
    {
      name: 'root-only',
      nodes: [{ id: 'root', parentId: null }],
    },
    {
      name: 'chain',
      nodes: [
        { id: 'root', parentId: null },
        { id: 'n1', parentId: 'root', order: 0 },
        { id: 'n2', parentId: 'n1', order: 0 },
      ],
    },
    {
      name: 'wide-star',
      nodes: [
        { id: 'root', parentId: null },
        ...Array.from({ length: 6 }, (_, i) => ({ id: `leaf-${i}`, parentId: 'root', order: i })),
      ],
    },
    {
      name: 'uneven-subtrees',
      nodes: [
        { id: 'root', parentId: null },
        { id: 'left', parentId: 'root', order: 0 },
        { id: 'mid', parentId: 'root', order: 1 },
        { id: 'right', parentId: 'root', order: 2 },
        { id: 'left-a', parentId: 'left', order: 0 },
        { id: 'left-b', parentId: 'left', order: 1 },
        { id: 'mid-a', parentId: 'mid', order: 0 },
        { id: 'right-a', parentId: 'right', order: 0 },
        { id: 'right-b', parentId: 'right', order: 1 },
        { id: 'right-c', parentId: 'right', order: 2 },
      ],
    },
  ];

  for (const scenario of cases) {
    const result = arrangeTree(scenario.nodes);
    for (const [id, point] of Object.entries(result.positions)) {
      assert.ok(Number.isFinite(point.x), `${scenario.name}: non-finite x for ${id}`);
      assert.ok(Number.isFinite(point.y), `${scenario.name}: non-finite y for ${id}`);
      assert.equal(point.y % TREE_RANK_PITCH, 0, `${scenario.name}: unexpected y pitch for ${id}`);
    }
    assertMinHorizontalSpacing(scenario.nodes, TREE_LEAF_PITCH);
  }

  const rootOnly = arrangeTree([{ id: 'root', parentId: null }]).positions.root;
  assert.deepEqual(rootOnly, { x: 0, y: 0 });
}

function testMedianParentAlignment(): void {
  const nodes: LayoutNode[] = [
    { id: 'root', parentId: null },
    { id: 'group-even', parentId: 'root', order: 0 },
    { id: 'group-odd', parentId: 'root', order: 1 },
    { id: 'e0', parentId: 'group-even', order: 0 },
    { id: 'e1', parentId: 'group-even', order: 1 },
    { id: 'e2', parentId: 'group-even', order: 2 },
    { id: 'e3', parentId: 'group-even', order: 3 },
    { id: 'o0', parentId: 'group-odd', order: 0 },
    { id: 'o1', parentId: 'group-odd', order: 1 },
    { id: 'o2', parentId: 'group-odd', order: 2 },
  ];

  const { positions } = arrangeTree(nodes);
  const evenChildren = childrenOf(nodes, 'group-even').map(node => positions[node.id].x);
  const oddChildren = childrenOf(nodes, 'group-odd').map(node => positions[node.id].x);
  const evenMedian = (evenChildren[1] + evenChildren[2]) / 2;
  const oddMedian = oddChildren[1];

  assert.equal(positions['group-even'].x, evenMedian);
  assert.equal(positions['group-odd'].x, oddMedian);
}

function testErrorCases(): void {
  const cases: Array<{ name: string; nodes: LayoutNode[]; expected: RegExp }> = [
    {
      name: 'duplicate-id',
      nodes: [
        { id: 'root', parentId: null },
        { id: 'dup', parentId: 'root' },
        { id: 'dup', parentId: 'root' },
      ],
      expected: /Duplicate node id/,
    },
    {
      name: 'missing-parent',
      nodes: [
        { id: 'root', parentId: null },
        { id: 'orphan', parentId: 'ghost' },
      ],
      expected: /Missing parent/,
    },
    {
      name: 'multiple-roots',
      nodes: [
        { id: 'root-a', parentId: null },
        { id: 'root-b', parentId: null },
      ],
      expected: /expected exactly one root/,
    },
    {
      name: 'cycle',
      nodes: [
        { id: 'root', parentId: 'child' },
        { id: 'child', parentId: 'root' },
      ],
      expected: /expected exactly one root|Cycle detected/,
    },
    {
      name: 'disconnected',
      nodes: [
        { id: 'root', parentId: null },
        { id: 'a', parentId: 'root' },
        { id: 'b', parentId: null },
      ],
      expected: /expected exactly one root/,
    },
    {
      name: 'invalid-id',
      nodes: [{ id: '   ', parentId: null }],
      expected: /Invalid node id/,
    },
  ];

  for (const scenario of cases) {
    assert.throws(() => arrangeTree(scenario.nodes), scenario.expected, scenario.name);
  }
}

testCalibrationAgainstDarkuxSnapshot();
testTopologyCoverage();
testMedianParentAlignment();
testErrorCases();

console.log('layout.test.ts: ok');
