// ============================================================================
// 2-Column Compact Layout — canvas coordinates for the health model
// ============================================================================
// Two top-level "major" categories (Failures, Latency) sit in side-by-side
// columns. Each column hosts one stamp-loop group per stamp; per-stamp leaves
// wrap into a 3-column grid stacked vertically as the loop iterates. After
// all stamps, "minor" categories (optional groups) are spread in a single row
// underneath.
//
// Coordinates are emitted as Bicep expressions because stamp-loop entities
// reference `length(stamps)` and the loop index `i`. Both x and y can be
// expressions of the form `c + s * length(stamps)` (Linear), with an optional
// per-stamp delta (`stampOffset`) used inside a `for stamp in stamps` loop.

export const TARGET_WIDTH = 2000;
export const COL_GAP = 100;
export const COL_WIDTH = (TARGET_WIDTH - COL_GAP) / 2; // 950
export const LEAF_COLS = 3;
export const LEAF_WIDTH = 300;
export const LEAF_HEIGHT = 200;
export const STAMP_GAP = 100;
export const CATEGORY_GAP = 100;
export const ROOT_Y = 0;
export const CATEGORY_Y = 200;
export const STAMP_GROUP_Y0 = 400;
/** Vertical offset of the first leaf row inside a stamp section. */
export const LEAF_Y_OFFSET = 150;
/** Vertical offset of a per-stamp minor leaf below its minor category. */
export const PER_STAMP_LEAF_Y_OFFSET = 200;
/** Per-stamp y delta for a minor per-stamp leaf. */
export const PER_STAMP_LEAF_Y_STEP = 250;

/** Integer pixel value of the form: c + s * length(stamps). */
export interface Linear {
  c: number;
  s: number;
}

const L = (c: number, s: number = 0): Linear => ({ c, s });

export interface SingleLayout {
  kind: 'single';
  x: Linear;
  y: Linear;
}

export interface LoopLayout {
  kind: 'loop';
  baseX: Linear;
  /** Pixels added to x per stamp index `i`. Often 0 in this layout. */
  stampOffsetX: number;
  baseY: Linear;
  /** Pixels added to y per stamp index `i`. */
  stampOffsetY: number;
}

export type NodeLayout = SingleLayout | LoopLayout;

/** Structured input describing every entity that needs a canvas position. */
export interface LayoutSpec {
  rootKey: string;
  failures: { categoryKey: string; stampGroupKey: string; leafKeys: readonly string[] };
  latency: { categoryKey: string; stampGroupKey: string; leafKeys: readonly string[] };
  /** Global optional category keys (one entity each, no children). */
  minorGlobals: readonly string[];
  /** Per-stamp optional categories: a single category + a per-stamp leaf loop. */
  minorPerStamp: readonly { categoryKey: string; perStampLeafKey: string }[];
}

/**
 * Compute layout for every entity described in `spec`. All math stays in
 * integer pixel units; the few half-pixel values (centering an even number
 * of leaves) are rounded — visually invisible, structurally stable.
 */
export function computeLayout(spec: LayoutSpec): Map<string, NodeLayout> {
  const out = new Map<string, NodeLayout>();
  const maxLeaves = Math.max(spec.failures.leafKeys.length, spec.latency.leafKeys.length);
  const stampH = Math.ceil(maxLeaves / LEAF_COLS) * LEAF_HEIGHT + STAMP_GAP;

  const setSingle = (k: string, x: number | Linear, y: number | Linear): void => {
    out.set(k, {
      kind: 'single',
      x: typeof x === 'number' ? L(x) : x,
      y: typeof y === 'number' ? L(y) : y,
    });
  };

  // Root
  setSingle(spec.rootKey, TARGET_WIDTH / 2, ROOT_Y);

  // Major-category column geometry.
  const failuresColCenter = COL_WIDTH / 2;                    // 475
  const failuresColLeft = 0;
  const latencyColCenter = COL_WIDTH + COL_GAP + COL_WIDTH / 2; // 1525
  const latencyColLeft = COL_WIDTH + COL_GAP;                  // 1050

  setSingle(spec.failures.categoryKey, failuresColCenter, CATEGORY_Y);
  setSingle(spec.latency.categoryKey, latencyColCenter, CATEGORY_Y);

  // Stamp groups (loop): same x for every stamp; y advances by stampH per stamp.
  out.set(spec.failures.stampGroupKey, {
    kind: 'loop',
    baseX: L(failuresColCenter), stampOffsetX: 0,
    baseY: L(STAMP_GROUP_Y0), stampOffsetY: stampH,
  });
  out.set(spec.latency.stampGroupKey, {
    kind: 'loop',
    baseX: L(latencyColCenter), stampOffsetX: 0,
    baseY: L(STAMP_GROUP_Y0), stampOffsetY: stampH,
  });

  // Place leaves in a 3-col wrapped grid centered (or left-aligned) per column.
  const placeLeaves = (leaves: readonly string[], colCenter: number, colLeft: number): void => {
    const n = leaves.length;
    if (n === 0) return;
    const startX = n <= LEAF_COLS
      ? colCenter - ((n - 1) * LEAF_WIDTH) / 2
      : colLeft + LEAF_WIDTH / 2;
    for (let k = 0; k < n; k++) {
      const col = k % LEAF_COLS;
      const row = Math.floor(k / LEAF_COLS);
      const x = Math.round(startX + col * LEAF_WIDTH);
      const baseY = STAMP_GROUP_Y0 + LEAF_Y_OFFSET + row * LEAF_HEIGHT;
      out.set(leaves[k], {
        kind: 'loop',
        baseX: L(x), stampOffsetX: 0,
        baseY: L(baseY), stampOffsetY: stampH,
      });
    }
  };
  placeLeaves(spec.failures.leafKeys, failuresColCenter, failuresColLeft);
  placeLeaves(spec.latency.leafKeys, latencyColCenter, latencyColLeft);

  // Minor categories: single row beneath every stamp section.
  // minor_y_base = STAMP_GROUP_Y0 + stampH * length(stamps) + CATEGORY_GAP
  const minorYBase: Linear = { c: STAMP_GROUP_Y0 + CATEGORY_GAP, s: stampH };

  type MinorEntry = { key: string; perStampLeafKey?: string };
  const minorEntries: MinorEntry[] = [
    ...spec.minorGlobals.map(k => ({ key: k })),
    ...spec.minorPerStamp.map(m => ({ key: m.categoryKey, perStampLeafKey: m.perStampLeafKey })),
  ];

  const numMinors = minorEntries.length;
  for (let i = 0; i < numMinors; i++) {
    const entry = minorEntries[i];
    const x = numMinors > 0
      ? Math.round((i + 0.5) * (TARGET_WIDTH / numMinors))
      : Math.round(TARGET_WIDTH / 2);
    setSingle(entry.key, x, minorYBase);

    if (entry.perStampLeafKey) {
      out.set(entry.perStampLeafKey, {
        kind: 'loop',
        baseX: L(x), stampOffsetX: 0,
        baseY: { c: minorYBase.c + PER_STAMP_LEAF_Y_OFFSET, s: minorYBase.s },
        stampOffsetY: PER_STAMP_LEAF_Y_STEP,
      });
    }
  }

  return out;
}

// ─── Bicep expression rendering ────────────────────────────────────────

/** Render a Linear pixel value as a Bicep numeric expression. */
export function renderLinear(l: Linear): string {
  if (l.s === 0) return String(l.c);
  const sTerm = l.s === 1 ? 'length(stamps)'
              : l.s === -1 ? '-length(stamps)'
              : `${l.s} * length(stamps)`;
  if (l.c === 0) return sTerm;
  return `${l.c} + ${sTerm}`;
}

/**
 * Render a per-axis loop expression: `base + i * stampOffset`. Used for x and
 * y of entities emitted inside a `for stamp in stamps` loop.
 */
export function renderLoopAxis(base: Linear, stampOffset: number): string {
  const baseStr = renderLinear(base);
  if (stampOffset === 0) return baseStr;
  const iTerm = stampOffset === 1 ? 'i'
              : stampOffset === -1 ? '-i'
              : `i * ${stampOffset}`;
  if (base.c === 0 && base.s === 0) return iTerm;
  return `${baseStr} + ${iTerm}`;
}

/** Backwards-compatible alias — older call sites used renderLoopX for x only. */
export const renderLoopX = renderLoopAxis;
