import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { PlatformConfig } from './config';
import { buildAppDashboard } from './dashboard';

const config: PlatformConfig = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));
const outputDir = join(__dirname, '..', '..', 'docs', 'grafana');
mkdirSync(outputDir, { recursive: true });

for (const app of config.apps) {
  const dashboard = buildAppDashboard(app, config);
  const outPath = join(outputDir, `${app.name}-dashboard.json`);
  writeFileSync(outPath, JSON.stringify(dashboard, null, 2));
  console.log(`✅ Generated ${outPath}`);
}
