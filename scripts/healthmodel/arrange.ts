import { readFileSync } from 'fs';
import {
  arrangeTree,
  TREE_LEAF_PITCH,
  TREE_RANK_PITCH,
  type LayoutNode,
} from './layout';

export interface AdapterEntity {
  id: string;
  displayName?: string;
  canvasPosition?: { x: number; y: number };
}

export interface AdapterRelationship {
  parentEntityName: string;
  childEntityName: string;
}

export interface AuthoredOrderSeed {
  id: string;
  order: number;
}

export interface ArrangeAdapterInput {
  entities: AdapterEntity[];
  relationships: AdapterRelationship[];
  authoredOrder?: AuthoredOrderSeed[];
}

export interface ArrangeAdapterOutput {
  positions: Array<{ id: string; canvasPosition: { x: number; y: number } }>;
  orderedIds: string[];
  meta: { leafPitch: number; rankPitch: number };
}

function parseSeedMap(seeds: readonly AuthoredOrderSeed[]): Map<string, number> {
  const seedMap = new Map<string, number>();
  for (const seed of seeds) {
    if (!Number.isFinite(seed.order)) {
      throw new Error(`Invalid authored order for '${seed.id}'`);
    }
    seedMap.set(seed.id, seed.order);
  }
  return seedMap;
}

function stableEntityOrder(
  childrenByParent: Map<string | null, string[]>,
  seedMap: Map<string, number>,
): Map<string, number> {
  const rankMap = new Map<string, number>();
  const queue: Array<string | null> = [null];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = childrenByParent.get(parentId) ?? [];
    const seeded = children
      .filter(id => seedMap.has(id))
      .sort((a, b) => {
        const bySeed = seedMap.get(a)! - seedMap.get(b)!;
        return bySeed !== 0 ? bySeed : a.localeCompare(b);
      });
    const discovered = children
      .filter(id => !seedMap.has(id))
      .sort((a, b) => a.localeCompare(b));
    const orderedChildren = [...seeded, ...discovered];
    orderedChildren.forEach((childId, index) => {
      rankMap.set(childId, index);
      queue.push(childId);
    });
  }
  return rankMap;
}

function toLayoutNodes(input: ArrangeAdapterInput): LayoutNode[] {
  const idSet = new Set<string>();
  for (const entity of input.entities) {
    if (!entity.id || entity.id.trim().length === 0) {
      throw new Error('Invalid entity id: empty value');
    }
    const id = entity.id.trim();
    if (idSet.has(id)) {
      throw new Error(`Duplicate entity id: '${id}'`);
    }
    idSet.add(id);
  }

  const parentByChild = new Map<string, string>();
  for (const rel of input.relationships) {
    const parent = rel.parentEntityName.trim();
    const child = rel.childEntityName.trim();
    if (!idSet.has(parent)) {
      throw new Error(`Missing parent endpoint '${parent}'`);
    }
    if (!idSet.has(child)) {
      throw new Error(`Missing child endpoint '${child}'`);
    }
    const existingParent = parentByChild.get(child);
    if (existingParent && existingParent !== parent) {
      throw new Error(`Multiple parents for '${child}': '${existingParent}' and '${parent}'`);
    }
    parentByChild.set(child, parent);
  }

  const childrenByParent = new Map<string | null, string[]>();
  const ensureList = (key: string | null): string[] => {
    const existing = childrenByParent.get(key);
    if (existing) return existing;
    const created: string[] = [];
    childrenByParent.set(key, created);
    return created;
  };

  const roots: string[] = [];
  for (const id of idSet) {
    const parent = parentByChild.get(id) ?? null;
    if (parent === null) {
      roots.push(id);
    } else {
      ensureList(parent).push(id);
    }
  }
  childrenByParent.set(null, roots);

  const seedMap = parseSeedMap(input.authoredOrder ?? []);
  const siblingOrderById = stableEntityOrder(childrenByParent, seedMap);

  const layoutNodes: LayoutNode[] = [];
  for (const id of idSet) {
    layoutNodes.push({
      id,
      parentId: parentByChild.get(id) ?? null,
      order: siblingOrderById.get(id),
    });
  }
  return layoutNodes;
}

export function arrangeFromInput(input: ArrangeAdapterInput): ArrangeAdapterOutput {
  const result = arrangeTree(toLayoutNodes(input));
  const positions = Object.entries(result.positions)
    .map(([id, canvasPosition]) => ({ id, canvasPosition }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    positions,
    orderedIds: result.orderedIds,
    meta: { leafPitch: TREE_LEAF_PITCH, rankPitch: TREE_RANK_PITCH },
  };
}

export function runArrangeStdio(rawInput: string): string {
  const parsed = JSON.parse(rawInput) as ArrangeAdapterInput;
  const output = arrangeFromInput(parsed);
  return `${JSON.stringify(output)}\n`;
}

if (require.main === module) {
  const input = readFileSync(0, 'utf8');
  process.stdout.write(runArrangeStdio(input));
}
