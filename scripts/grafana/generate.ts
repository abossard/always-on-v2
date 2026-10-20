import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { PlatformConfig } from './config';
import { buildAppDashboard } from './dashboard';

const [configFile, selector = 'all', destination] = process.argv.slice(2);
if (!configFile) {
  throw new Error('Pass a deployment-resolved config file from deployment.ts. Checked-in historical targets are not deployment inputs.');
}
const config: PlatformConfig = JSON.parse(readFileSync(configFile, 'utf-8'));
if (!config.tenantId || !config.subscription || !config.globalResourceGroup) {
  throw new Error('Dashboard generation requires deployment tenant, subscription and resource group');
}
if (selector !== 'all' && !config.apps.some(app => app.name === selector)) {
  throw new Error(`Unknown dashboard selector ${selector}`);
}
const outputDir = destination ?? join(__dirname, '..', '..', 'docs', 'grafana');
mkdirSync(outputDir, { recursive: true });

for (const app of config.apps) {
  if (selector !== 'all' && app.name !== selector) continue;
  const dashboard = buildAppDashboard(app, config);
  const outPath = join(outputDir, `${app.name}-dashboard.json`);
  writeFileSync(outPath, JSON.stringify(dashboard, null, 2));
  console.log(`✅ Generated ${outPath}`);
}
