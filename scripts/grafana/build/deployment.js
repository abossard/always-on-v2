"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindDeploymentConfig = bindDeploymentConfig;
exports.loadDeploymentConfig = loadDeploymentConfig;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
function required(values, key) {
    const value = values[key];
    if (typeof value !== 'string' || !value.trim())
        throw new Error(`Missing deployment output ${key}`);
    return value;
}
function stampsFrom(environment) {
    const stamps = JSON.parse(required(environment, 'stampDeployVars'));
    if (!Array.isArray(stamps) || !stamps.length
        || new Set(stamps.map(stamp => stamp.stampName)).size !== stamps.length) {
        throw new Error('Missing or duplicate deployment stamps');
    }
    for (const stamp of stamps) {
        for (const key of ['stampName', 'regionKey', 'clusterName', 'clusterResourceGroup']) {
            if (typeof stamp[key] !== 'string' || !stamp[key].trim()) {
                throw new Error(`Missing deployment stamp ${key}`);
            }
        }
    }
    return stamps;
}
function bindDeploymentConfig(base, metadata) {
    const { account, environment, globalOutputs, stampOutputs } = metadata;
    const subscription = required(environment, 'AZURE_SUBSCRIPTION_ID');
    const tenantId = required(environment, 'AZURE_TENANT_ID');
    if (account.id !== subscription)
        throw new Error('Deployment subscription does not match the selected account');
    if (account.tenantId !== tenantId)
        throw new Error('Deployment tenant does not match the selected account');
    const globalResourceGroup = required(environment, 'globalResourceGroupName');
    const resource = (outputs, key, group, type) => {
        const id = outputs[key]?.value;
        const prefix = `/subscriptions/${subscription}/resourceGroups/${group}/providers/${type}/`;
        if (typeof id !== 'string' || !id.toLowerCase().startsWith(prefix.toLowerCase())
            || !id.slice(prefix.length) || id.slice(prefix.length).includes('/')) {
            throw new Error(`Deployment ${key} must identify ${type} in ${subscription}/${group}`);
        }
        return id.slice(prefix.length);
    };
    const stamps = stampsFrom(environment);
    if (stampOutputs.length !== stamps.length)
        throw new Error('Deployment stamp outputs do not match stampDeployVars');
    const aiServicesAccount = required(environment, 'aiServicesName');
    const snapshot = base.aiObservability;
    if (snapshot && (snapshot.subscription !== subscription
        || snapshot.resourceGroup !== globalResourceGroup || snapshot.accountName !== aiServicesAccount)) {
        throw new Error('AI allocation snapshot target differs from deployment. Refresh or remove the stale snapshot explicitly.');
    }
    return {
        ...base,
        tenantId,
        subscription,
        globalResourceGroup,
        domainName: required(environment, 'dnsZoneName'),
        resources: {
            cosmosAccount: resource(globalOutputs, 'cosmosId', globalResourceGroup, 'Microsoft.DocumentDB/databaseAccounts'),
            frontDoorProfile: resource(globalOutputs, 'frontDoorId', globalResourceGroup, 'Microsoft.Cdn/profiles'),
            eventHubsNamespace: resource(globalOutputs, 'eventHubsNamespaceId', globalResourceGroup, 'Microsoft.EventHub/namespaces'),
            captureStorageAccount: resource(globalOutputs, 'ehCaptureStorageId', globalResourceGroup, 'Microsoft.Storage/storageAccounts'),
            aiServicesAccount,
        },
        stamps: stamps.map((stamp, index) => {
            const outputs = stampOutputs[index];
            const cluster = resource(outputs, 'aksClusterId', stamp.clusterResourceGroup, 'Microsoft.ContainerService/managedClusters');
            if (cluster !== stamp.clusterName)
                throw new Error(`Deployment cluster mismatch for ${stamp.stampName}`);
            return {
                key: stamp.stampName,
                region: stamp.regionKey,
                cluster,
                resourceGroup: stamp.clusterResourceGroup,
                storageAccount: resource(outputs, 'helloAgentsStorageId', stamp.clusterResourceGroup, 'Microsoft.Storage/storageAccounts'),
                cosmosOrleansAccount: resource(outputs, 'stampCosmosAccountId', stamp.clusterResourceGroup, 'Microsoft.DocumentDB/databaseAccounts'),
            };
        }),
    };
}
function readJson(tool, args) {
    return JSON.parse((0, node_child_process_1.execFileSync)(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}
function loadDeploymentConfig(base, environmentName, subscription, resourceGroup) {
    if (!environmentName || !subscription || !resourceGroup) {
        throw new Error('Pass the deployment environment, subscription and resource group explicitly');
    }
    const environment = readJson('azd', ['env', 'get-values', '--environment', environmentName, '--output', 'json']);
    if (environment.AZURE_ENV_NAME !== environmentName || environment.AZURE_SUBSCRIPTION_ID !== subscription
        || environment.globalResourceGroupName !== resourceGroup) {
        throw new Error('Dashboard destination does not match the named deployment environment subscription/resource group');
    }
    const account = readJson('az', ['account', 'show', '--subscription', subscription, '--output', 'json']);
    if (account.id !== subscription)
        throw new Error('Dashboard deployment subscription does not match the selected account');
    if (account.tenantId !== environment.AZURE_TENANT_ID
        || (process.env.AZURE_TENANT_ID && process.env.AZURE_TENANT_ID !== account.tenantId)) {
        throw new Error('Dashboard deployment tenant does not match the selected account');
    }
    const outputs = (group, name) => {
        const deployment = readJson('az', [
            'deployment', 'group', 'show', '--subscription', subscription, '--resource-group', group,
            '--name', name, '--output', 'json',
        ]);
        if (deployment.properties?.provisioningState !== 'Succeeded') {
            throw new Error(`Deployment ${name} in ${group} is not Succeeded`);
        }
        return deployment.properties.outputs;
    };
    const globalOutputs = outputs(resourceGroup, 'deploy-global');
    const stamps = stampsFrom(environment);
    const stampOutputs = stamps.map(stamp => outputs(stamp.clusterResourceGroup, `deploy-stamp-${stamp.stampName}`));
    const config = bindDeploymentConfig(base, { account, environment, globalOutputs, stampOutputs });
    const apiVersions = {
        frontDoorId: '2024-09-01', cosmosId: '2024-05-15', eventHubsNamespaceId: '2024-01-01',
        ehCaptureStorageId: '2023-05-01', aksClusterId: '2024-10-01',
        helloAgentsStorageId: '2023-05-01', stampCosmosAccountId: '2024-05-15',
    };
    for (const resourceOutputs of [globalOutputs, ...stampOutputs]) {
        for (const [key, apiVersion] of Object.entries(apiVersions)) {
            if (!resourceOutputs[key])
                continue;
            const id = resourceOutputs[key].value;
            const live = readJson('az', [
                'rest', '--method', 'GET', '--subscription', subscription,
                '--url', `https://management.azure.com${id}?api-version=${apiVersion}`, '--output', 'json',
            ]);
            if (live.id?.toLowerCase() !== id.toLowerCase())
                throw new Error(`Live resource mismatch for ${key}`);
        }
    }
    const aiId = `/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${config.resources.aiServicesAccount}`;
    const ai = readJson('az', [
        'rest', '--method', 'GET', '--subscription', subscription,
        '--url', `https://management.azure.com${aiId}?api-version=2024-10-01`, '--output', 'json',
    ]);
    if (ai.id?.toLowerCase() !== aiId.toLowerCase())
        throw new Error('Live AI resource mismatch');
    return config;
}
if (require.main === module) {
    try {
        const [environment, subscription, group, output] = process.argv.slice(2);
        if (!output)
            throw new Error('Usage: deployment.ts <azd-environment> <subscription> <resource-group> <output-config>');
        const base = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, 'config.json'), 'utf8'));
        (0, node_fs_1.writeFileSync)(output, JSON.stringify(loadDeploymentConfig(base, environment, subscription, group), null, 2));
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : 'Deployment targeting failed');
        process.exitCode = 1;
    }
}
