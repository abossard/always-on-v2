const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const repo = resolve(process.env.HOOK_CONTRACT_SOURCE || join(__dirname, '..'));
const images = ['helloorleons', 'helloagents', 'helloagents-web', 'darkux', 'darkux-web', 'graphorleons', 'graphorleons-web'];
const dockerfiles = [
  'src/HelloOrleons/HelloOrleons.Api/Dockerfile',
  'src/HelloAgents/HelloAgents.Api/Dockerfile',
  'src/HelloAgents/HelloAgents.Web/Dockerfile',
  'src/DarkUxChallenge/DarkUxChallenge.Api/Dockerfile',
  'src/DarkUxChallenge/DarkUxChallenge.SPA.Web/Dockerfile',
  'src/GraphOrleons/GraphOrleons.Api/Dockerfile',
  'src/GraphOrleons/GraphOrleons.Web/Dockerfile',
];
const stamps = ['swedencentral', 'eastus2'].map(region => ({
  stampName: `${region}-001`, regionKey: region,
  clusterName: `aks-fixture-${region}-001`, clusterResourceGroup: `rg-fixture-${region}-001`,
  fluxVars: { ENABLE_FLUX: 'false', ENABLE_CUSTOM_DOMAIN: 'false', ACR_LOGIN_SERVER: 'fixture.azurecr.io',
    HELLOAGENTS_NAMESPACE: 'helloagents', DARKUX_NAMESPACE: 'darkux',
    GRAPHORLEONS_NAMESPACE: 'graphorleons', HELLOORLEONS_NAMESPACE: 'helloorleons' },
}));
const endpoints = images.filter(name => !name.endsWith('-web')).map(name => ({ name, frontDoorUrl: `https://${name}.example.invalid` }));
const stubBody = `
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.HOOK_FIXTURE_ROOT;
if (!root || !(process.cwd() === root || process.cwd().startsWith(root + '/'))
    || !path.resolve(process.argv[1]).startsWith(root + '/bin/')) {
  throw Error('Hook stub outside isolated fixture');
}
const args = process.argv.slice(2);
const statePath = path.join(root, 'state.json');
const state = JSON.parse(fs.readFileSync(statePath));
const call = { tool, args };
if (tool === 'kubectl' && args[0] === 'apply') call.input = fs.readFileSync(0, 'utf8');
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(call) + '\\n');
const fail = process.env.HOOK_FAIL || '';
function value(flag) { return args[args.indexOf(flag) + 1]; }
if (tool === 'azd') {
  if (args[0] !== 'env') throw Error('Unexpected azd command');
  if (args[1] === 'set') {
    if (fail === 'persist-' + args[2] && args[3]) process.exit(17);
    state[args[2]] = args[3]; fs.writeFileSync(statePath, JSON.stringify(state));
  } else if (args[1] === 'get-value') {
    if (!state[args[2]]) process.exit(18);
    process.stdout.write(state[args[2]]);
  } else throw Error('Unexpected azd command');
} else if (tool === 'az') {
  if (args[0] === 'account') {
    const outputs = { id: process.env.HOOK_SUBSCRIPTION || 'sub-fixture', tenantId: 'tenant-fixture', 'user.type': 'user' };
    process.stdout.write(outputs[value('--query')] || '');
  } else if (args[0] === 'ad') process.stdout.write('principal-fixture');
  else if (args[0] === 'deployment') {
    if (args[2] === 'list') process.stdout.write('fixture-previous-succeeded');
    else {
      const outputs = { 'properties.outputs.acrLoginServer.value': 'fixture.azurecr.io',
        'properties.outputs.stampDeployVars.value': process.env.stampDeployVars,
        'properties.outputs.aksClusterNames.value': JSON.stringify(${JSON.stringify(stamps.map(s => s.clusterName))}),
        'properties.outputs.appEndpoints.value': process.env.appEndpoints,
        'properties.outputs.frontDoorEndpointHostName.value': 'frontdoor.example.invalid' };
      process.stdout.write(outputs[value('--query')] || '');
    }
  }
  else if (args[0] === 'extension') process.exit(fail === 'extension' ? 19 : 0);
  else if (args[0] === 'aks') {
    if (fail === args[1]) process.exit(20);
    if (args[1] === 'show') process.stdout.write('Disabled');
  } else if (args[0] === 'acr' && args[1] === 'build') {
    if (value('--subscription') !== 'sub-fixture') throw Error('Build subscription missing');
    if (value('--image').startsWith(fail + ':')) process.exit(21);
  } else throw Error('Unexpected az command: ' + args.join(' '));
} else if (tool === 'git') {
  if (args[0] === 'rev-parse') process.stdout.write('12345678');
  else if (args[0] === 'status') process.stdout.write(' M src/compatibility.cs\\n');
  else if (args[0] === 'ls-files') {
    const files = [];
    function walk(dir) {
      for (const ent of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const name = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(name); else files.push(name);
      }
    }
    walk('src'); process.stdout.write(['.dockerignore', ...files].join('\\0') + '\\0');
  } else throw Error('Unexpected git command');
} else if (tool === 'kustomize') {
  if (fs.readFileSync(path.join(args[1], 'kustomization.yaml'), 'utf8').includes('/infra')) process.exit(0);
  for (const image of ${JSON.stringify(images)}) {
    if (image === fail) continue;
    console.log('          image: fixture.azurecr.io/' + image + ':1777365732-69423575');
    if (fail === 'duplicate' && image === 'helloagents') console.log('          image: fixture.azurecr.io/' + image + ':1777365732-69423575');
  }
} else if (tool === 'envsubst') process.stdout.write(fs.readFileSync(0));
else if (tool === 'kubectl') {
  if (args[0] === 'get' && args[1] === 'deployments') {
    const ns = value('-n');
    for (const image of ${JSON.stringify(images)}) if (image === ns || image === ns + '-web') console.log('deployment.apps/' + image);
  }
} else if (tool === 'curl') process.stdout.write('200');
else if (tool === 'npx') process.exit(fail === 'generate' ? 22 : 0);
else if (tool === 'npm') throw Error('Installed dependencies must not be restored');
else if (tool === 'publisher' || tool === 'discovery') {
  if (tool === 'discovery') call.targets = JSON.parse(process.env.HEALTHMODEL_TARGET_MODELS_JSON);
  fs.appendFileSync(path.join(root, 'effects.jsonl'), JSON.stringify(call) + '\\n');
  process.exit(fail === tool ? 23 : 0);
} else if (tool !== 'sleep') throw Error('Unexpected tool');
`;

function fixture(hook, options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'azd-hook-contract-')));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    for (const name of ['awk', 'bash', 'basename', 'cat', 'cut', 'date', 'dirname', 'find', 'jq', 'mktemp', 'python3', 'rm', 'rsync', 'sed', 'seq', 'shasum', 'sort', 'tr', 'xargs', 'grep']) {
      const command = spawnSync('/usr/bin/which', [name], { encoding: 'utf8' });
      assert.equal(command.status, 0, name);
      symlinkSync(command.stdout.trim(), join(bin, name));
    }
    for (const tool of ['az', 'azd', 'git', 'kustomize', 'envsubst', 'kubectl', 'curl', 'npx', 'npm', 'sleep', 'publisher', 'discovery']) {
      writeFileSync(join(bin, tool), `#!${process.execPath}\nconst tool = ${JSON.stringify(tool)};\n${stubBody}`, { mode: 0o755 });
    }
    const put = (path, content) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), content);
    };
    put(`hooks/${hook}.sh`, readFileSync(join(repo, `hooks/${hook}.sh`)));
    if (options.rootIgnoreDrift) put('hooks/predeploy.sh', readFileSync(join(repo, 'hooks/predeploy.sh')));
    put('.dockerignore', '*\n!src/\n!src/**\n');
    put('scripts/healthmodel/node_modules/.bin/ts-node', '');
    chmodSync(join(root, 'scripts/healthmodel/node_modules/.bin/ts-node'), 0o755);
    put('scripts/healthmodel/link-discovery-root.sh', `#!/bin/bash\nexec "${bin}/discovery" "$@"\n`);
    put('scripts/grafana/deploy.sh', `#!/bin/bash\nexec "${bin}/publisher" "$@"\n`);
    put('scripts/grafana/config.json', JSON.stringify({ aiObservability: { resourceGroup: 'rg-fixture-global', subscription: 'sub-fixture' } }));
    for (const path of dockerfiles) put(path, 'FROM scratch\n');
    put(dockerfiles[1], 'FROM scratch\nCOPY src/HelloAgents/compatibility.cs /compatibility.cs\n');
    put('src/HelloAgents/compatibility.cs', '// uncommitted compatibility input\n');
    if (options.missingDockerfile) rmSync(join(root, dockerfiles[0]));
    if (options.missingContext) rmSync(join(root, 'src/HelloAgents/HelloAgents.Web'), { recursive: true });
    if (options.unsafeSymlink) symlinkSync('/outside/credentials', join(root, 'src/unsafe-link'));
    for (const region of ['swedencentral', 'eastus2']) {
      mkdirSync(join(root, 'clusters', region, 'apps'), { recursive: true });
      mkdirSync(join(root, 'clusters', region, 'infra'), { recursive: true });
    }
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    const files = ['.dockerignore', ...dockerfiles.filter(path => existsSync(join(root, path))), 'src/HelloAgents/compatibility.cs'].sort();
    const hash = digest(files.map(path => `${digest(readFileSync(join(root, path)))}  ./${path}\n`).join(''));
    const state = { IMAGE_TAG: `1792212523-12345678-dirty-${hash.slice(0, 12)}`, IMAGE_SOURCE_HASH: hash, ...options.state };
    put('state.json', JSON.stringify(state));
    if (options.sourceDrift) put('src/HelloAgents/compatibility.cs', '// changed after build\n');
    if (options.unrelatedDrift) put('src/health-models-tui/screenshot.svg', '<svg/>\n');
    const env = {
      PATH: bin, HOME: root, HOOK_FIXTURE_ROOT: root,
      AZURE_ENV_NAME: 'fixture', AZURE_SUBSCRIPTION_ID: 'sub-fixture',
      AZURE_TENANT_ID: 'tenant-fixture', AZURE_PRINCIPAL_ID: 'principal-fixture', AZURE_LOCATION: 'swedencentral',
      acrLoginServer: 'fixture.azurecr.io', stampDeployVars: JSON.stringify(stamps),
      appEndpoints: JSON.stringify(endpoints), frontDoorEndpointHostName: 'frontdoor.example.invalid',
      globalResourceGroupName: 'rg-fixture-global',
      ACR_LOGIN_SERVER: 'fixture.azurecr.io', STAMP_DEPLOY_VARS: JSON.stringify(stamps),
      IMAGE_TAG: state.IMAGE_TAG, IMAGE_SOURCE_HASH: state.IMAGE_SOURCE_HASH,
      ...options.env,
    };
    if (options.rootIgnoreDrift) {
      const build = spawnSync('/bin/bash', [join(root, 'hooks/predeploy.sh')], { cwd: root, env, encoding: 'utf8', timeout: 15000 });
      assert.ifError(build.error);
      assert.equal(build.status, 0, build.stdout + build.stderr);
      put('.dockerignore', '*\n!src/\n!src/**\nsrc/HelloAgents/compatibility.cs\n');
    }
    const result = spawnSync('/bin/bash', [join(root, `hooks/${hook}.sh`)], { cwd: root, env, encoding: 'utf8', timeout: 15000 });
    assert.ifError(result.error);
    const readLines = name => existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    const calls = readLines('calls.jsonl');
    const effects = readLines('effects.jsonl');
    const output = result.stdout + result.stderr;
    if (options.rootIgnoreDrift) console.log(JSON.stringify({
      case: 'root-ignore-drift', exit: result.status,
      appApplies: calls.filter(call => call.tool === 'kubectl' && call.input?.includes('image:')).length,
      publisherCalls: effects.filter(call => call.tool === 'publisher').length,
    }));
    if (options.failure) assert.notEqual(result.status, 0, output);
    else assert.equal(result.status, 0, output);
    if (!options.failure) {
      for (const call of calls.filter(call => call.tool === 'azd')) {
        assert.equal(call.args[call.args.indexOf('--environment') + 1], 'fixture', 'azd command must name its environment');
      }
    }
    if (options.check) options.check({ calls, effects, state: JSON.parse(readFileSync(join(root, 'state.json'))), expectedSourceHash: hash, output });
    return { calls, effects, output };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const cases = [];
function test(name, run) { cases.push({ name, run }); }
for (const fail of ['', 'generate']) {
  test(`preprovision generation ${fail || 'success'}`, () => fixture('preprovision', { env: { HOOK_FAIL: fail }, failure: !!fail }));
}
test('preprovision requires environment', () => fixture('preprovision', { env: { AZURE_ENV_NAME: '' }, failure: true }));
test('preprovision rejects wrong subscription', () => fixture('preprovision', { env: { HOOK_SUBSCRIPTION: 'wrong' }, failure: true }));
for (const fail of ['', 'update', 'get-credentials', 'discovery', 'extension', 'persist-ACR_LOGIN_SERVER']) {
  test(`postprovision ${fail || 'current outputs'}`, () => fixture('postprovision', {
    env: { HOOK_FAIL: fail }, failure: !!fail,
    check: ({ calls, effects }) => {
      assert.ok(!calls.some(call => call.args[0] === 'deployment'));
      if (!fail) {
        assert.equal(calls.filter(call => call.tool === 'az' && call.args[1] === 'get-credentials').length, 2);
        assert.deepEqual(effects[0].targets, ['hm-all-platforms', 'hm-darkux', 'hm-graphorleons', 'hm-helloagents', 'hm-helloorleons', 'hm-platform-eastus2-001', 'hm-platform-swedencentral-001']);
      }
    },
  }));
}
for (const key of ['acrLoginServer', 'stampDeployVars', 'appEndpoints']) {
  for (const hook of ['postprovision', 'predeploy', 'postdeploy'].filter(name => key !== 'appEndpoints' || name !== 'predeploy')) {
    test(`${hook} rejects missing ${key}`, () => fixture(hook, {
      env: { [key]: '' }, failure: true,
      check: ({ calls }) => assert.ok(!calls.some(call => call.tool === 'az' && ['aks', 'acr', 'deployment'].includes(call.args[0]))),
    }));
  }
}
for (const options of [{}, { missingContext: true }, { missingDockerfile: true }, { unsafeSymlink: true },
  { env: { HOOK_FAIL: 'helloagents' } }, { env: { HOOK_FAIL: 'persist-IMAGE_TAG' } }, { env: { HOOK_FAIL: 'persist-IMAGE_SOURCE_HASH' } }]) {
  test(`predeploy ${JSON.stringify(options)}`, () => fixture('predeploy', {
    ...options, failure: Object.keys(options).length > 0,
    check: ({ calls, state, expectedSourceHash }) => {
      const builds = calls.filter(call => call.tool === 'az' && call.args[0] === 'acr');
      if (Object.keys(options).length === 0) {
        assert.equal(builds.length, 7);
        assert.deepEqual(builds.map(call => call.args[call.args.indexOf('--image') + 1].split(':')[0]), images);
        assert.match(state.IMAGE_SOURCE_HASH, /^[a-f0-9]{64}$/);
        assert.equal(state.IMAGE_SOURCE_HASH, expectedSourceHash);
        assert.ok(state.IMAGE_TAG.endsWith(state.IMAGE_SOURCE_HASH.slice(0, 12)));
      }
    },
  }));
}
for (const fail of ['', 'publisher', 'helloagents-web', 'duplicate']) {
  test(`postdeploy ${fail || 'fresh images and AI-only publisher'}`, () => fixture('postdeploy', {
    env: { HOOK_FAIL: fail }, failure: !!fail,
    check: ({ calls, effects, state }) => {
      const apps = calls.filter(call => call.tool === 'kubectl' && call.input?.includes('image:'));
      if (!fail || fail === 'publisher') {
        assert.equal(apps.length, 2);
        for (const app of apps) {
          const actual = app.input.trim().split('\n').map(line => line.trim().slice('image: '.length)).sort();
          assert.deepEqual(actual, images.map(name => `fixture.azurecr.io/${name}:${state.IMAGE_TAG}`).sort());
        }
        assert.deepEqual(effects[0].args, ['rg-fixture-global', 'swedencentral', 'sub-fixture', 'fixture', 'helloagents']);
      } else assert.equal(apps.length, 0);
    },
  }));
}
for (const state of [{ IMAGE_TAG: '' }, { IMAGE_SOURCE_HASH: '' }, { IMAGE_TAG: '1792212523-12345678-dirty-bbbbbbbbbbbb' }]) {
  test(`postdeploy rejects missing/stale attribution ${JSON.stringify(state)}`, () => fixture('postdeploy', {
    state, failure: true, check: ({ calls }) => assert.ok(!calls.some(call => call.tool === 'kubectl' || call.tool === 'az' && call.args[0] === 'aks')),
  }));
}
for (const [key, value] of [['AZURE_TENANT_ID', ''], ['AZURE_TENANT_ID', 'other-tenant'], ['globalResourceGroupName', '']]) {
  test(`postdeploy rejects missing/mismatched dashboard deployment input ${key}=${value}`, () => fixture('postdeploy', {
    env: { [key]: value }, failure: true,
    check: ({ calls, effects }) => {
      assert.equal(effects.length, 0);
      assert.ok(!calls.some(call => call.tool === 'kubectl' || call.tool === 'az' && call.args[0] === 'aks'));
    },
  }));
}
test('postdeploy uses persisted attribution, not inherited old tag', () => fixture('postdeploy', {
  env: { IMAGE_TAG: 'inherited-old-tag' },
}));
for (const drift of ['sourceDrift', 'rootIgnoreDrift']) {
  test(`postdeploy rejects ${drift} after builds`, () => fixture('postdeploy', {
    [drift]: true, failure: true,
    check: ({ calls }) => assert.ok(!calls.some(call => call.tool === 'kubectl' || call.tool === 'az' && call.args[0] === 'aks')),
  }));
}
test('postdeploy ignores unrelated TUI churn outside image COPY inputs', () => fixture('postdeploy', {
  unrelatedDrift: true,
}));
for (const hook of ['postprovision', 'predeploy', 'postdeploy']) {
  test(`${hook} rejects mismatched stamp environment`, () => fixture(hook, {
    env: { stampDeployVars: JSON.stringify([{ ...stamps[0], clusterResourceGroup: 'rg-other-swedencentral-001' }]) }, failure: true,
    check: ({ calls }) => assert.ok(!calls.some(call => call.tool === 'az' && ['aks', 'acr'].includes(call.args[0]))),
  }));
}
let failed = 0;
for (const { name, run } of cases) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`${cases.length - failed}/${cases.length} actual-hook contracts passed`);
process.exitCode = failed ? 1 : 0;
