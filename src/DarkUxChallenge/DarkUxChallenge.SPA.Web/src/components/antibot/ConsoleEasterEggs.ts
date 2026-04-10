let initialized = false;

export function initConsoleEasterEggs() {
  if (initialized) return;
  initialized = true;

  // looks like leftover dev logging that someone forgot to remove
  console.debug('[darkux] api client initialized, base=/api');
  console.debug('[darkux] feature flags: {v2Api: true, legacyExport: true, adminPanel: false}');
  console.debug('[darkux] session store: indexedDB fallback active');
  console.debug('[darkux] v2 migration endpoints still active — see /api/v2/users for bulk export');

  // looks like a debug helper from a previous developer
  (window as unknown as Record<string, unknown>).__debug = () => {
    console.log('[darkux] env=staging, build=4.2.1-rc3');
    console.log('[darkux] api endpoints:', {
      users: '/api/v2/users',
      export: '/api/v2/users?format=json&limit=all',
      config: '/api/v2/config',
      health: '/api/health',
    });
    return { env: 'staging', build: '4.2.1-rc3' };
  };

  // looks like telemetry init that logs its config
  console.debug('[otel] collector endpoint: https://darkux-otel.westeurope.azurecontainer.io:4318');
  console.debug('[otel] service.name=darkux-spa, service.version=4.2.1-rc3');
}
