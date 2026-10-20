"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const dashboard_1 = require("./dashboard");
const [configFile, selector = 'all', destination] = process.argv.slice(2);
if (!configFile) {
    throw new Error('Pass a deployment-resolved config file from deployment.ts. Checked-in historical targets are not deployment inputs.');
}
const config = JSON.parse((0, fs_1.readFileSync)(configFile, 'utf-8'));
if (!config.tenantId || !config.subscription || !config.globalResourceGroup) {
    throw new Error('Dashboard generation requires deployment tenant, subscription and resource group');
}
if (selector !== 'all' && !config.apps.some(app => app.name === selector)) {
    throw new Error(`Unknown dashboard selector ${selector}`);
}
const outputDir = destination ?? (0, path_1.join)(__dirname, '..', '..', 'docs', 'grafana');
(0, fs_1.mkdirSync)(outputDir, { recursive: true });
for (const app of config.apps) {
    if (selector !== 'all' && app.name !== selector)
        continue;
    const dashboard = (0, dashboard_1.buildAppDashboard)(app, config);
    const outPath = (0, path_1.join)(outputDir, `${app.name}-dashboard.json`);
    (0, fs_1.writeFileSync)(outPath, JSON.stringify(dashboard, null, 2));
    console.log(`✅ Generated ${outPath}`);
}
