"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const dashboard_1 = require("./dashboard");
const config = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, 'config.json'), 'utf-8'));
const outputDir = (0, path_1.join)(__dirname, '..', '..', 'docs', 'grafana');
(0, fs_1.mkdirSync)(outputDir, { recursive: true });
for (const app of config.apps) {
    const dashboard = (0, dashboard_1.buildAppDashboard)(app, config);
    const outPath = (0, path_1.join)(outputDir, `${app.name}-dashboard.json`);
    (0, fs_1.writeFileSync)(outPath, JSON.stringify(dashboard, null, 2));
    console.log(`✅ Generated ${outPath}`);
}
