// ============================================================================
// Generic Bicep Code Emitter
// ============================================================================
// Stateless functions that produce Bicep syntax strings.
// No health-model or domain knowledge — purely structural.

export interface BicepParam {
  name: string;
  type: string;
  description?: string;
  defaultValue?: string;
  decorators?: string[];
}

/** Emit a `param` declaration. */
export function param(p: BicepParam): string {
  const lines: string[] = [];
  if (p.decorators) {
    for (const d of p.decorators) lines.push(d);
  }
  if (p.description) {
    lines.push(`@description('${escapeBicepString(p.description)}')`);
  }
  const def = p.defaultValue !== undefined ? ` = ${p.defaultValue}` : '';
  lines.push(`param ${p.name} ${p.type}${def}`);
  return lines.join('\n');
}

/** Emit a `var` declaration. */
export function variable(name: string, expr: string): string {
  return `var ${name} = ${expr}`;
}

/** Emit an `output` declaration. */
export function output(name: string, type: string, value: string): string {
  return `output ${name} ${type} = ${value}`;
}

/** Emit a single-line comment. */
export function comment(text: string): string {
  return `// ${text}`;
}

/** Emit a section header comment. */
export function section(title: string): string {
  const pad = 70 - title.length - 6;
  const dashes = '─'.repeat(Math.max(4, pad));
  return `// ─── ${title} ${dashes}`;
}

// ── Object / Value Rendering ────────────────────────────────────────

export type BicepValue =
  | string
  | number
  | boolean
  | BicepRaw
  | BicepValue[]
  | { [key: string]: BicepValue };

/** Wraps a raw Bicep expression that should NOT be quoted. */
export class BicepRaw {
  constructor(public readonly expr: string) {}
}

/** Shorthand: wrap an expression to be emitted raw (no quotes). */
export function raw(expr: string): BicepRaw {
  return new BicepRaw(expr);
}

/** guid(...args) expression */
export function guid(...parts: string[]): BicepRaw {
  return raw(`guid(${parts.join(', ')})`);
}

/** json('N') — Bicep pattern for numeric values in certain APIs */
export function jsonNum(n: number): BicepRaw {
  return raw(`json('${n}')`);
}

/** Bicep string interpolation: '${expr}' */
export function interpolate(parts: TemplateStringsArray, ...values: string[]): BicepRaw {
  let result = '';
  for (let i = 0; i < parts.length; i++) {
    result += parts[i];
    if (i < values.length) result += `\${${values[i]}}`;
  }
  return raw(`'${result}'`);
}

/** Render a BicepValue to a string with proper indentation. */
export function renderValue(value: BicepValue, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);

  if (value instanceof BicepRaw) return value.expr;
  if (typeof value === 'string') return `'${escapeBicepString(value)}'`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(v => `${innerPad}${renderValue(v, indent + 1)}`);
    return `[\n${items.join('\n')}\n${pad}]`;
  }

  // Object
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  const lines = entries.map(([k, v]) => {
    const needsQuotes = k.includes('/') || k.includes('.') || k.includes('$') || k.includes('-');
    const key = needsQuotes ? `'${k}'` : k;
    const rendered = renderValue(v, indent + 1);
    // If rendered starts with '{' or '[', put on same line with key
    if (rendered.startsWith('{') || rendered.startsWith('[')) {
      return `${innerPad}${key}: ${rendered}`;
    }
    return `${innerPad}${key}: ${rendered}`;
  });
  return `{\n${lines.join('\n')}\n${pad}}`;
}

// ── Resource Blocks ─────────────────────────────────────────────────

export interface ResourceDef {
  symbolic: string;
  type: string;
  apiVersion: string;
  body: { [key: string]: BicepValue };
  decorators?: string[];
  /** If set, wraps the resource in `= if (condition) { ... }` */
  condition?: string;
}

/** Emit a resource block. */
export function resource(def: ResourceDef): string {
  const lines: string[] = [];
  if (def.decorators) {
    for (const d of def.decorators) lines.push(d);
  }
  const cond = def.condition ? `if (${def.condition}) ` : '';
  lines.push(`#disable-next-line BCP081`);
  lines.push(`resource ${def.symbolic} '${def.type}@${def.apiVersion}' = ${cond}${renderValue(def.body)}`);
  return lines.join('\n');
}

export interface ResourceLoopDef extends ResourceDef {
  arrayExpr: string;
  itemVar: string;
  indexVar: string;
}

/** Emit a resource block with a for loop. */
export function resourceLoop(def: ResourceLoopDef): string {
  const lines: string[] = [];
  if (def.decorators) {
    for (const d of def.decorators) lines.push(d);
  }
  lines.push(`#disable-next-line BCP081`);
  lines.push(
    `resource ${def.symbolic} '${def.type}@${def.apiVersion}' = [`,
    `  for (${def.itemVar}, ${def.indexVar}) in ${def.arrayExpr}: ${renderValue(def.body, 1)}`,
    `]`,
  );
  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────

function escapeBicepString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Join multiple Bicep blocks with blank lines. */
export function joinBlocks(...blocks: string[]): string {
  return blocks.join('\n\n');
}
