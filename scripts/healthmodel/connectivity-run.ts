import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAzureArmTransport, type AzureArmAllowedOperation } from './connectivity-arm-transport';
import { compileConnectivityCatalog, renderConnectivityBicep } from './connectivity-compiler';
import {
  connectivityBaseCatalogDefinitions,
  connectivityBindingManifest,
  connectivityCatalogDefinitions,
  connectivityExpandedP0CatalogDefinitions,
} from './connectivity-catalog';
import type {
  CompileConnectivityCatalogInput,
  ConnectivityCompiledCatalog,
  ConnectivityEntityDefinition,
  ConnectivityHealthState,
  ConnectivityModelId,
  ConnectivitySceneOmittedReport,
} from './connectivity-types';

const healthModelApiVersion = '2026-11-01';
const roleAssignmentApiVersion = '2022-04-01';
const cdnProfileApiVersion = '2025-04-15';
const cosmosAccountApiVersion = '2024-11-15';
const readerRoleDefinitionGuid = 'acdd72a7-3385-48ef-bd42-f606fba81ae7';

export type ConnectivityExecutionMode = 'preflight' | 'plan' | 'apply' | 'publish' | 'verify' | 'reset' | 'render-bicep';
export type ConnectivityCatalogVariant = 'base' | 'expanded';

export interface ConnectivityRuntimeConfig {
  readonly compiledCatalog: ConnectivityCompiledCatalog;
  readonly subscriptionId: string;
  readonly resourceGroupName: string;
}

export interface ConnectivityReaderGrant {
  readonly scope: string;
  readonly roleDefinitionId: string;
}

export interface ConnectivityReaderGrantPlanEntry {
  readonly modelName: ConnectivityModelId;
  readonly modelId: string;
  readonly requiredContextAnchorIds: readonly string[];
  readonly assignments: readonly ConnectivityReaderGrant[];
}

export interface ConnectivityPostAllowlistEntry {
  readonly modelName: ConnectivityModelId;
  readonly sceneId: string;
  readonly readiness: 'scene-ready' | 'evidence-gap';
  readonly entityId: string;
  readonly signalName: string;
  readonly healthState: ConnectivityHealthState;
  readonly expiresInMinutes: number;
  readonly additionalContext: string;
  readonly omittedReports: readonly ConnectivitySceneOmittedReport[];
}

export interface ConnectivityIngestHealthReportRequest {
  readonly signalName: string;
  readonly healthState: ConnectivityHealthState;
  readonly expiresInMinutes: number;
  readonly additionalContext: string;
}

export interface ConnectivityMutationRoute {
  readonly azdCapabilitiesEvidence: readonly string[];
  readonly commandTemplate: readonly string[];
  readonly notes: readonly string[];
}

export interface ConnectivityRuntimePlan {
  readonly compiledCatalog: ConnectivityCompiledCatalog;
  readonly targetModelIds: readonly string[];
  readonly requiredContextAnchorIds: readonly string[];
  readonly readerGrantPlan: readonly ConnectivityReaderGrantPlanEntry[];
  readonly p0PostAllowlist: readonly ConnectivityPostAllowlistEntry[];
  readonly mutationRoute: ConnectivityMutationRoute;
}

export interface ConnectivityExecutionGrant {
  readonly ownerSessionId: string;
  readonly planDigest: string;
  readonly targetModelIds: readonly string[];
  readonly modelPrincipalIds?: Readonly<Partial<Record<ConnectivityModelId, string>>>;
  readonly allowApply: boolean;
  readonly allowPublish: boolean;
  readonly allowVerify: boolean;
}

export interface ConnectivityHttpRequest {
  readonly method: 'GET' | 'PUT' | 'POST';
  readonly url: string;
  readonly body?: unknown;
}

export interface ConnectivityHttpResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface ConnectivityTransport {
  request(input: ConnectivityHttpRequest): Promise<ConnectivityHttpResponse>;
}

export interface ConnectivityExecutionInput {
  readonly mode: ConnectivityExecutionMode;
  readonly plan: ConnectivityRuntimePlan;
  readonly transport?: ConnectivityTransport;
  readonly armTransportFactory?: (allowedOperations: readonly AzureArmAllowedOperation[]) => ConnectivityTransport;
  readonly grant?: ConnectivityExecutionGrant;
  readonly expectedOwnerSessionId?: string;
  readonly modelName?: ConnectivityModelId;
  readonly sceneId?: string;
  readonly outputPath?: string;
}

export interface ConnectivityExecutionResult {
  readonly status: 'preflight' | 'planned' | 'applied' | 'published' | 'verified' | 'reset' | 'rendered-bicep';
  readonly planDigest: string;
  readonly writeCount: number;
  readonly verification: 'scene-ready' | 'expected-gap' | 'failed' | 'not-run';
}

export function createRuntimeConfigFromCompiledCatalog(input: CompileConnectivityCatalogInput & {
  readonly subscriptionId: string;
  readonly resourceGroupName: string;
}): ConnectivityRuntimeConfig {
  const compiledCatalog = compileConnectivityCatalog(input);
  return {
    compiledCatalog,
    subscriptionId: input.subscriptionId,
    resourceGroupName: input.resourceGroupName,
  };
}

export function defaultConnectivityRuntimeConfig(input: {
  readonly subscriptionId: string;
  readonly resourceGroupName: string;
  readonly catalogVariant?: ConnectivityCatalogVariant;
}): ConnectivityRuntimeConfig {
  const catalog = resolveCatalogDefinition(input.catalogVariant);
  const config = createRuntimeConfigFromCompiledCatalog({
    catalog,
    bindings: connectivityBindingManifest,
    options: { ignoreUnknownPolicy: 'explicit' },
    subscriptionId: input.subscriptionId,
    resourceGroupName: input.resourceGroupName,
  });
  return {
    ...config,
    compiledCatalog: applyVerifiedRealContextBindings(config.compiledCatalog, input.subscriptionId, input.resourceGroupName),
  };
}

export function buildConnectivityRuntimePlan(config: ConnectivityRuntimeConfig): ConnectivityRuntimePlan {
  const targetModelIds = config.compiledCatalog.models.map(model => modelResourceId(config.subscriptionId, config.resourceGroupName, model.id));
  const readerRoleDefinitionId = canonicalReaderRoleDefinitionId(config.subscriptionId);

  const readerGrantPlan: ConnectivityReaderGrantPlanEntry[] = config.compiledCatalog.models.map(model => {
    const requiredContextAnchorIds = uniqueAnchors(
      Object.values(model.binding.resourceBindings).map(binding => binding.azureResourceId),
    );
    if (requiredContextAnchorIds.length === 0) {
      throw new Error(`${model.id} has no real-context resource bindings in the target manifest`);
    }
    return {
      modelName: model.id,
      modelId: modelResourceId(config.subscriptionId, config.resourceGroupName, model.id),
      requiredContextAnchorIds,
      assignments: requiredContextAnchorIds.map(scope => ({
        scope,
        roleDefinitionId: readerRoleDefinitionId,
      })),
    };
  });

  const p0PostAllowlist: ConnectivityPostAllowlistEntry[] = config.compiledCatalog.models.flatMap(model =>
    model.publisherPlan.flatMap(scene =>
      scene.reports.map(report => ({
        modelName: model.id,
        sceneId: scene.sceneId,
        readiness: scene.readiness,
        entityId: report.entityId,
        signalName: report.signalName,
        healthState: report.healthState,
        expiresInMinutes: report.expiresInMinutes,
        additionalContext: report.additionalContext,
        omittedReports: scene.omittedReports,
      })),
    ),
  );
  for (const entry of p0PostAllowlist) {
    buildIngestHealthReportRequest(entry);
  }

  return {
    compiledCatalog: config.compiledCatalog,
    targetModelIds,
    requiredContextAnchorIds: uniqueAnchors(readerGrantPlan.flatMap(item => item.requiredContextAnchorIds)),
    readerGrantPlan,
    p0PostAllowlist,
    mutationRoute: {
      azdCapabilitiesEvidence: [
        'azd hooks --help: includes `hooks run` command',
        'azd hooks run --help: explicit `azd hooks run <name>` with --environment/--layer/--service',
        'azd provision --help: --preview available for resource what-if',
        'azd deploy --help: --preview available and hooks do not run during preview',
      ],
      commandTemplate: [
        'cd demos/connectivity',
        'azd provision --preview --environment <demo-environment>',
        'CONNECTIVITY_CATALOG_VARIANT=<base|expanded> CONNECTIVITY_MODE=apply CONNECTIVITY_GRANT_FILE=<grant-file> azd hooks run postprovision --environment <demo-environment>',
        'CONNECTIVITY_CATALOG_VARIANT=<base|expanded> CONNECTIVITY_MODE=publish CONNECTIVITY_MODEL=<model> CONNECTIVITY_SCENE=<scene> CONNECTIVITY_GRANT_FILE=<grant-file> azd hooks run postprovision --environment <demo-environment>',
      ],
      notes: [
        'No mutation path runs without an approved grant digest that exactly matches the reviewed plan.',
        'A changed plan, changed scope, foreign owner, or invalid model/scene/entity yields zero writes.',
      ],
    },
  };
}

export function createPlanDigest(plan: ConnectivityRuntimePlan): string {
  const normalized = {
    targetModelIds: [...plan.targetModelIds].sort(),
    readerGrantPlan: [...plan.readerGrantPlan]
      .map(item => ({
        modelName: item.modelName,
        assignments: [...item.assignments].map(assignment => ({
          scope: assignment.scope,
          roleDefinitionId: assignment.roleDefinitionId,
        })).sort((a, b) => `${a.scope}|${a.roleDefinitionId}`.localeCompare(`${b.scope}|${b.roleDefinitionId}`)),
      }))
      .sort((a, b) => a.modelName.localeCompare(b.modelName)),
    p0PostAllowlist: [...plan.p0PostAllowlist]
      .map(item => ({
        modelName: item.modelName,
        sceneId: item.sceneId,
        readiness: item.readiness,
        entityId: item.entityId,
        signalName: item.signalName,
        healthState: item.healthState,
        expiresInMinutes: item.expiresInMinutes,
        additionalContext: item.additionalContext,
        omittedReports: [...item.omittedReports].map(omission => `${omission.entityId}/${omission.signalName}`).sort(),
      }))
      .sort((a, b) =>
        `${a.modelName}|${a.sceneId}|${a.entityId}|${a.signalName}`.localeCompare(
          `${b.modelName}|${b.sceneId}|${b.entityId}|${b.signalName}`,
        ),
      ),
  };

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function buildIngestHealthReportRequest(entry: ConnectivityPostAllowlistEntry): ConnectivityIngestHealthReportRequest {
  if (!Number.isInteger(entry.expiresInMinutes) || entry.expiresInMinutes < 1 || entry.expiresInMinutes > 10080) {
    throw new Error(
      `Invalid expiresInMinutes=${entry.expiresInMinutes} for ${entry.modelName}/${entry.sceneId}/${entry.entityId}/${entry.signalName}`,
    );
  }
  if (entry.additionalContext.length > 4096) {
    throw new Error(
      `additionalContext exceeds 4096 chars for ${entry.modelName}/${entry.sceneId}/${entry.entityId}/${entry.signalName}`,
    );
  }
  return {
    signalName: entry.signalName,
    healthState: entry.healthState,
    expiresInMinutes: entry.expiresInMinutes,
    additionalContext: entry.additionalContext,
  };
}

export async function executeConnectivityMode(input: ConnectivityExecutionInput): Promise<ConnectivityExecutionResult> {
  const planDigest = createPlanDigest(input.plan);
  if (input.mode === 'preflight') {
    const transport = input.transport ?? denyTransport();
    await validateAnchorsAndTargetModels(transport, input.plan, true);
    return { status: 'preflight', planDigest, writeCount: 0, verification: 'not-run' };
  }
  if (input.mode === 'plan') {
    assertApprovalReadyBindings(input.plan);
    return { status: 'planned', planDigest, writeCount: 0, verification: 'not-run' };
  }
  if (input.mode === 'render-bicep') {
    const bicep = renderConnectivityDemoBicep(input.plan.compiledCatalog, input.plan);
    if (input.outputPath) {
      writeFileSync(resolve(input.outputPath), bicep, 'utf8');
    }
    return { status: 'rendered-bicep', planDigest, writeCount: 0, verification: 'not-run' };
  }

  const grant = assertAuthorizedGrant(input, planDigest);
  const transport = input.transport ?? denyTransport();

  if (input.mode === 'apply') {
    await validateAnchorsAndTargetModels(transport, input.plan, true);

    const principalIdsByModel: Partial<Record<ConnectivityModelId, string>> = {};
    let writeCount = 0;
    for (const model of input.plan.compiledCatalog.models) {
      const modelId = modelResourceIdFromName(model.id, input.plan.targetModelIds);
      await write(transport, {
        method: 'PUT',
        url: `${managementUrl(modelId)}?api-version=${healthModelApiVersion}`,
        body: {
          location: model.binding.hostRegion,
          identity: { type: 'SystemAssigned' },
          properties: {
            displayName: model.displayName,
            tags: {
              simulation: 'true',
              connectivitySubject: model.binding.subject,
              connectivityHostRegion: model.binding.hostRegion,
            },
          },
        },
      });
      writeCount += 1;

      const modelReadback = await readResource(transport, modelId);
      validateModelReadbackIdentity(modelReadback, modelId, model.binding.hostRegion, model.binding.subject);
      const resolvedPrincipalId = getModelPrincipalId(modelReadback);
      const pinnedPrincipal = grant.modelPrincipalIds?.[model.id];
      if (pinnedPrincipal && pinnedPrincipal !== resolvedPrincipalId) {
        throw new Error(`Model identity mismatch for ${model.id}. Expected ${pinnedPrincipal}, got ${resolvedPrincipalId}`);
      }
      principalIdsByModel[model.id] = resolvedPrincipalId;

      for (const entity of model.entities) {
        await write(transport, {
          method: 'PUT',
          url: `${managementUrl(modelId)}/entities/${entity.id}?api-version=${healthModelApiVersion}`,
          body: buildEntityBody(entity),
        });
        writeCount += 1;
      }

      for (const relationship of model.relationships) {
        await write(transport, {
          method: 'PUT',
          url: `${managementUrl(modelId)}/relationships/${relationship.id}?api-version=${healthModelApiVersion}`,
          body: {
            properties: {
              parentEntityName: relationship.parentEntityId,
              childEntityName: relationship.childEntityId,
            },
          },
        });
        writeCount += 1;
      }
    }

    for (const modelGrant of input.plan.readerGrantPlan) {
      const principalId = principalIdsByModel[modelGrant.modelName];
      if (!principalId) {
        throw new Error(`Missing resolved model principal ID for ${modelGrant.modelName}`);
      }
      for (const assignment of modelGrant.assignments) {
        const roleAssignmentName = deterministicRoleAssignmentGuid(assignment.scope, principalId, assignment.roleDefinitionId);
        const request: ConnectivityHttpRequest = {
          method: 'PUT',
          url: `${managementUrl(assignment.scope)}/providers/Microsoft.Authorization/roleAssignments/${roleAssignmentName}?api-version=${roleAssignmentApiVersion}`,
          body: {
            properties: {
              principalId,
              roleDefinitionId: assignment.roleDefinitionId,
              principalType: 'ServicePrincipal',
            },
          },
        };
        if (input.armTransportFactory) {
          const path = new URL(request.url).pathname;
          const roleTransport = input.armTransportFactory([{
            method: 'PUT',
            path,
            apiVersion: roleAssignmentApiVersion,
          }]);
          await write(roleTransport, request);
        } else if (input.transport) {
          await write(transport, request);
        } else {
          await writeWithInlineAzureTransport(input.plan, request, roleAssignmentApiVersion);
        }
        writeCount += 1;
      }
    }

    return {
      status: 'applied',
      planDigest,
      writeCount,
      verification: 'not-run',
    };
  }

  const sceneSelection = selectScene(input.plan, input.modelName, input.sceneId);
  if (input.mode === 'publish') {
    await validateAnchorsAndTargetModels(transport, input.plan, false);
    const publishAtByReportKey = new Map<string, number>();
    let writeCount = 0;
    for (const report of sceneSelection.reports) {
      const requestBody = buildIngestHealthReportRequest(report);
      const requestKey = reportKey(report.entityId, report.signalName);
      publishAtByReportKey.set(requestKey, Date.now());
      await write(transport, {
        method: 'POST',
        url: `${managementUrl(modelResourceIdFromName(report.modelName, input.plan.targetModelIds))}/entities/${report.entityId}/ingestHealthReport?api-version=${healthModelApiVersion}`,
        body: requestBody,
      });
      writeCount += 1;
    }
    const verification = await verifySceneWithReadback(transport, input.plan, sceneSelection, publishAtByReportKey);
    if (verification === 'failed') {
      throw new Error(`Scene verification failed for ${sceneSelection.modelName}/${sceneSelection.sceneId}`);
    }
    return {
      status: 'published',
      planDigest,
      writeCount,
      verification,
    };
  }

  if (input.mode === 'reset') {
    await validateAnchorsAndTargetModels(transport, input.plan, false);
    const baseline = selectBaselineScene(input.plan, input.modelName);
    const publishAtByReportKey = new Map<string, number>();
    let writeCount = 0;
    for (const report of baseline.reports) {
      publishAtByReportKey.set(reportKey(report.entityId, report.signalName), Date.now());
      await write(transport, {
        method: 'POST',
        url: `${managementUrl(modelResourceIdFromName(report.modelName, input.plan.targetModelIds))}/entities/${report.entityId}/ingestHealthReport?api-version=${healthModelApiVersion}`,
        body: buildIngestHealthReportRequest(report),
      });
      writeCount += 1;
    }
    const verification = await verifySceneWithReadback(transport, input.plan, baseline, publishAtByReportKey);
    if (verification === 'failed') {
      throw new Error(`Reset baseline verification failed for ${baseline.modelName}/${baseline.sceneId}`);
    }
    return {
      status: 'reset',
      planDigest,
      writeCount,
      verification,
    };
  }

  await validateAnchorsAndTargetModels(transport, input.plan, false);
  const verification = await verifySceneWithReadback(transport, input.plan, sceneSelection, undefined);
  if (verification === 'failed') {
    throw new Error(`Scene verification failed for ${sceneSelection.modelName}/${sceneSelection.sceneId}`);
  }
  return {
    status: 'verified',
    planDigest,
    writeCount: 0,
    verification,
  };
}

export function renderConnectivityDemoBicep(compiledCatalog: ConnectivityCompiledCatalog, plan: ConnectivityRuntimePlan): string {
  const base = renderConnectivityBicep(compiledCatalog).trimEnd();
  const readerRoleDefinitionId = canonicalReaderRoleDefinitionId(extractSubscriptionId(plan));
  const lines = [base, '', '@description(\'Reader role definition id\')', `var readerRoleDefinitionId = '${readerRoleDefinitionId}'`, ''];

  const anchors = uniqueAnchors(plan.readerGrantPlan.flatMap(item => item.requiredContextAnchorIds));
  for (const anchor of anchors) {
    const { provider, type, name } = parseResourceId(anchor);
    const apiVersion = resolveApiVersionForResourceId(anchor);
    const symbol = `anchor_${sanitize(name)}`;
    lines.push('#disable-next-line BCP081');
    lines.push(`resource ${symbol} '${provider}/${type}@${apiVersion}' existing = {`);
    lines.push(`  name: '${name}'`);
    lines.push('}');
    lines.push('');
  }

  for (const modelGrant of plan.readerGrantPlan) {
    const modelSymbol = `hm_${sanitize(modelGrant.modelName)}`;
    for (const assignment of modelGrant.assignments) {
      const { name } = parseResourceId(assignment.scope);
      const anchorSymbol = `anchor_${sanitize(name)}`;
      const roleSymbol = `ra_${sanitize(modelGrant.modelName)}_${sanitize(name)}`;
      lines.push("resource " + roleSymbol + " 'Microsoft.Authorization/roleAssignments@2022-04-01' = {");
      lines.push(`  scope: ${anchorSymbol}`);
      lines.push(`  name: guid(${anchorSymbol}.id, ${modelSymbol}.name, readerRoleDefinitionId)`);
      lines.push('  properties: {');
      lines.push(`    principalId: ${modelSymbol}.identity.principalId`);
      lines.push('    roleDefinitionId: readerRoleDefinitionId');
      lines.push("    principalType: 'ServicePrincipal'");
      lines.push('  }');
      lines.push('}');
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function assertAuthorizedGrant(input: ConnectivityExecutionInput, planDigest: string): ConnectivityExecutionGrant {
  if (!input.grant) {
    throw new Error('Missing execution grant. Zero writes authorized.');
  }
  if (input.expectedOwnerSessionId && input.grant.ownerSessionId !== input.expectedOwnerSessionId) {
    throw new Error(`Foreign ownership: expected ${input.expectedOwnerSessionId}, got ${input.grant.ownerSessionId}`);
  }
  if (input.grant.planDigest !== planDigest) {
    throw new Error(`Grant digest mismatch. expected=${planDigest} got=${input.grant.planDigest}`);
  }

  const sortedPlanTargets = [...input.plan.targetModelIds].sort();
  const sortedGrantTargets = [...input.grant.targetModelIds].sort();
  if (JSON.stringify(sortedPlanTargets) !== JSON.stringify(sortedGrantTargets)) {
    throw new Error('Grant target IDs mismatch reviewed plan');
  }

  if (input.mode === 'apply' || input.mode === 'publish' || input.mode === 'verify' || input.mode === 'reset') {
    assertApprovalReadyBindings(input.plan);
  }

  if (input.mode === 'apply' && !input.grant.allowApply) {
    throw new Error('Grant does not allow apply mode');
  }
  if ((input.mode === 'publish' || input.mode === 'reset') && !input.grant.allowPublish) {
    throw new Error('Grant does not allow publish mode');
  }
  if (input.mode === 'verify' && !input.grant.allowVerify) {
    throw new Error('Grant does not allow verify mode');
  }

  return input.grant;
}

function buildEntityBody(entity: ConnectivityEntityDefinition): unknown {
  const properties: Record<string, unknown> = {
    displayName: entity.displayName,
    tags: {
      provenance: entity.provenance,
      ...(entity.canonicalIdentity ? { canonicalIdentity: entity.canonicalIdentity } : {}),
    },
  };
  if (entity.impact) {
    properties.impact = entity.impact;
  }
  if (entity.rollup) {
    properties.signalGroups = {
      dependencies: {
        aggregationType: entity.rollup.strategy,
        ignoreUnknown: Boolean(entity.rollup.ignoreUnknown),
      },
    };
  }
  return { properties };
}

function selectScene(plan: ConnectivityRuntimePlan, modelName?: ConnectivityModelId, sceneId?: string): {
  readonly modelName: ConnectivityModelId;
  readonly sceneId: string;
  readonly readiness: 'scene-ready' | 'evidence-gap';
  readonly reports: readonly ConnectivityPostAllowlistEntry[];
  readonly omittedReports: readonly ConnectivitySceneOmittedReport[];
} {
  if (!modelName || !sceneId) {
    throw new Error('Mode requires both --model and --scene selectors');
  }
  const reports = plan.p0PostAllowlist.filter(item => item.modelName === modelName && item.sceneId === sceneId);
  if (reports.length === 0) {
    throw new Error(`No allowlisted reports for ${modelName}/${sceneId}`);
  }
  return {
    modelName,
    sceneId,
    readiness: reports[0].readiness,
    reports,
    omittedReports: reports[0].omittedReports,
  };
}

function selectBaselineScene(plan: ConnectivityRuntimePlan, modelName?: ConnectivityModelId): {
  readonly modelName: ConnectivityModelId;
  readonly sceneId: string;
  readonly readiness: 'scene-ready' | 'evidence-gap';
  readonly reports: readonly ConnectivityPostAllowlistEntry[];
  readonly omittedReports: readonly ConnectivitySceneOmittedReport[];
} {
  if (!modelName) {
    throw new Error('Reset mode requires --model selector');
  }
  const baseline = plan.p0PostAllowlist.find(item => item.modelName === modelName && item.sceneId.endsWith('-baseline'));
  if (!baseline) {
    throw new Error(`No baseline scene found for ${modelName}`);
  }
  return selectScene(plan, modelName, baseline.sceneId);
}

async function verifySceneWithReadback(
  transport: ConnectivityTransport,
  plan: ConnectivityRuntimePlan,
  scene: {
    readonly modelName: ConnectivityModelId;
    readonly sceneId: string;
    readonly readiness: 'scene-ready' | 'evidence-gap';
    readonly reports: readonly ConnectivityPostAllowlistEntry[];
    readonly omittedReports: readonly ConnectivitySceneOmittedReport[];
  },
  publishAtByReportKey?: ReadonlyMap<string, number>,
): Promise<'scene-ready' | 'expected-gap' | 'failed'> {
  const modelId = modelResourceIdFromName(scene.modelName, plan.targetModelIds);
  const hasExpectedGapIntent = scene.readiness === 'evidence-gap'
    || scene.omittedReports.length > 0
    || scene.reports.some(report => report.healthState === 'Unknown');

  const omittedByEntity = new Map<string, string[]>();
  for (const omission of scene.omittedReports) {
    const existing = omittedByEntity.get(omission.entityId) ?? [];
    existing.push(omission.signalName);
    omittedByEntity.set(omission.entityId, existing);
  }

  const reportsByEntity = new Map<string, ConnectivityPostAllowlistEntry[]>();
  for (const report of scene.reports) {
    const existing = reportsByEntity.get(report.entityId) ?? [];
    existing.push(report);
    reportsByEntity.set(report.entityId, existing);
  }

  for (const [entityId, reports] of reportsByEntity.entries()) {
    const response = await transport.request({
      method: 'GET',
      url: `${managementUrl(modelId)}/entities/${entityId}?api-version=${healthModelApiVersion}`,
    });
    ensureSuccess(response, 'readback');
    const signals = parseExternalSignalsFromEntityReadback(response.body);

    for (const report of reports) {
      const observed = signals.find(signal => signal.name === report.signalName);
      if (!observed || observed.healthState !== report.healthState) {
        return 'failed';
      }
      const publishedAt = publishAtByReportKey?.get(reportKey(report.entityId, report.signalName));
      if (!isFresh(observed.reportedAt, report.expiresInMinutes, publishedAt)) {
        return 'failed';
      }
    }

    for (const omittedSignalName of omittedByEntity.get(entityId) ?? []) {
      if (signals.some(signal => signal.name === omittedSignalName)) {
        return 'failed';
      }
    }
  }

  return hasExpectedGapIntent ? 'expected-gap' : 'scene-ready';
}

function parseExternalSignalsFromEntityReadback(body: unknown): Array<{
  readonly name: string;
  readonly healthState: ConnectivityHealthState;
  readonly reportedAt?: string;
}> {
  const root = body as {
    properties?: {
      signalGroups?: {
        external?: {
          signals?: Array<{ name?: string; status?: { healthState?: ConnectivityHealthState; reportedAt?: string } }>;
        };
      };
    };
  };
  return (root.properties?.signalGroups?.external?.signals ?? [])
    .filter(signal => typeof signal.name === 'string' && !!signal.status?.healthState)
    .map(signal => ({
      name: signal.name!,
      healthState: signal.status!.healthState!,
      reportedAt: signal.status!.reportedAt,
    }));
}

function reportKey(entityId: string, signalName: string): string {
  return `${entityId}|${signalName}`;
}

function isFresh(reportedAt: string | undefined, expiresInMinutes: number, publishedAtMs?: number): boolean {
  if (!reportedAt) {
    return false;
  }
  const parsed = Date.parse(reportedAt);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  const now = Date.now();
  if (parsed > now + 60_000) {
    return false;
  }
  const ageMs = now - parsed;
  if (ageMs < 0 || ageMs > expiresInMinutes * 60_000) {
    return false;
  }
  if (publishedAtMs !== undefined && parsed + 60_000 < publishedAtMs) {
    return false;
  }
  return true;
}

async function readResource(transport: ConnectivityTransport, id: string): Promise<unknown> {
  const apiVersion = resolveApiVersionForResourceId(id);
  const response = await transport.request({
    method: 'GET',
    url: `${managementUrl(id)}?api-version=${apiVersion}`,
  });
  ensureSuccess(response, `GET ${id}`);
  return response.body ?? {};
}

async function validateAnchorsAndTargetModels(
  transport: ConnectivityTransport,
  plan: ConnectivityRuntimePlan,
  allowMissingTargets: boolean,
): Promise<void> {
  for (const anchorId of uniqueAnchors(plan.requiredContextAnchorIds)) {
    const body = await readResource(transport, anchorId);
    validateResourceEnvelope(body, anchorId);
  }

  for (const model of plan.compiledCatalog.models) {
    const modelId = modelResourceIdFromName(model.id, plan.targetModelIds);
    const apiVersion = resolveApiVersionForResourceId(modelId);
    const response = await transport.request({
      method: 'GET',
      url: `${managementUrl(modelId)}?api-version=${apiVersion}`,
    });
    if (response.status === 404 && allowMissingTargets) {
      continue;
    }
    ensureSuccess(response, `GET ${modelId}`);
    validateModelReadbackIdentity(response.body ?? {}, modelId, model.binding.hostRegion, model.binding.subject);
  }
}

function validateResourceEnvelope(body: unknown, expectedId: string): void {
  const resource = body as { id?: string; type?: string; location?: string };
  const expected = parseResourceId(expectedId);
  if (!resource.id || resource.id.toLowerCase() !== expectedId.toLowerCase()) {
    throw new Error(`Resource ID mismatch for ${expectedId}`);
  }
  if (!resource.type || resource.type.toLowerCase() !== `${expected.provider}/${expected.type}`.toLowerCase()) {
    throw new Error(`Resource type mismatch for ${expectedId}`);
  }
  if (!resource.location || typeof resource.location !== 'string') {
    throw new Error(`Resource location missing for ${expectedId}`);
  }
}

function validateModelReadbackIdentity(body: unknown, modelId: string, expectedLocation: string, expectedSubject: string): void {
  validateResourceEnvelope(body, modelId);
  const model = body as {
    location?: string;
    identity?: { type?: string; principalId?: string };
    properties?: { tags?: Record<string, string> };
  };
  if ((model.location ?? '').toLowerCase() !== expectedLocation.toLowerCase()) {
    throw new Error(`Model location mismatch for ${modelId}`);
  }
  const tags = model.properties?.tags ?? {};
  if (tags.connectivitySubject && tags.connectivitySubject !== expectedSubject) {
    throw new Error(`Model subject tag mismatch for ${modelId}`);
  }
}

function getModelPrincipalId(body: unknown): string {
  const model = body as { identity?: { type?: string; principalId?: string } };
  const identityType = model.identity?.type ?? '';
  if (!identityType.toLowerCase().includes('systemassigned')) {
    throw new Error('Model identity is not SystemAssigned');
  }
  const principalId = model.identity?.principalId;
  if (!principalId || !/^[0-9a-fA-F-]{36}$/.test(principalId)) {
    throw new Error('Model principalId is missing or invalid');
  }
  return principalId;
}

function resolveApiVersionForResourceId(resourceIdValue: string): string {
  const parsed = parseResourceId(resourceIdValue);
  const key = `${parsed.provider}/${parsed.type}`.toLowerCase();
  if (key === 'microsoft.cloudhealth/healthmodels') {
    return healthModelApiVersion;
  }
  if (key === 'microsoft.cdn/profiles') {
    return cdnProfileApiVersion;
  }
  if (key === 'microsoft.documentdb/databaseaccounts') {
    return cosmosAccountApiVersion;
  }
  throw new Error(`No API version mapping for ${parsed.provider}/${parsed.type}`);
}

async function write(transport: ConnectivityTransport, request: ConnectivityHttpRequest): Promise<void> {
  const response = await transport.request(request);
  ensureSuccess(response, `${request.method} ${request.url}`);
}

async function writeWithInlineAzureTransport(
  plan: ConnectivityRuntimePlan,
  request: ConnectivityHttpRequest,
  apiVersion: string,
): Promise<void> {
  const tenantId = process.env.AZURE_TENANT_ID;
  if (!tenantId) {
    throw new Error('AZURE_TENANT_ID is required for inline Azure ARM transport');
  }
  const subscriptionId = extractSubscriptionId(plan);
  const url = new URL(request.url);
  const transport = createAzureArmTransport({
    tenantId,
    subscriptionId,
    allowedOperations: [
      {
        method: request.method,
        path: url.pathname,
        apiVersion,
      },
    ],
  });
  const response = await transport.request(request);
  ensureSuccess(response, `${request.method} ${request.url}`);
}

function ensureSuccess(response: ConnectivityHttpResponse, operation: string): void {
  if (![200, 201, 202, 204].includes(response.status)) {
    throw new Error(`${operation} failed with status ${response.status}: ${JSON.stringify(response.body ?? null)}`);
  }
}

function denyTransport(): ConnectivityTransport {
  return {
    async request(input: ConnectivityHttpRequest): Promise<ConnectivityHttpResponse> {
      throw new Error(`No transport configured for ${input.method} ${input.url}. Zero writes performed.`);
    },
  };
}

function modelResourceId(subscriptionId: string, resourceGroupName: string, modelName: string): string {
  return resourceId(subscriptionId, resourceGroupName, 'Microsoft.CloudHealth', 'healthmodels', modelName);
}

function modelResourceIdFromName(modelName: ConnectivityModelId, targetModelIds: readonly string[]): string {
  const found = targetModelIds.find(id => id.endsWith(`/healthmodels/${modelName}`));
  if (!found) {
    throw new Error(`Missing target model ID for ${modelName}`);
  }
  return found;
}

function resourceId(
  subscriptionId: string,
  resourceGroupName: string,
  provider: string,
  type: string,
  name: string,
): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/${provider}/${type}/${name}`;
}

function parseResourceId(id: string): { provider: string; type: string; name: string } {
  const parts = id.split('/');
  const providerIndex = parts.findIndex(part => part.toLowerCase() === 'providers');
  if (providerIndex < 0 || providerIndex + 3 >= parts.length) {
    throw new Error(`Invalid resource ID: ${id}`);
  }
  return {
    provider: parts[providerIndex + 1],
    type: parts[providerIndex + 2],
    name: parts[providerIndex + 3],
  };
}

function deterministicRoleAssignmentGuid(scope: string, principalId: string, roleDefinitionId: string): string {
  const hash = createHash('sha1').update(`${scope}|${principalId}|${roleDefinitionId}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function managementUrl(resourceIdValue: string): string {
  return `https://management.azure.com${resourceIdValue}`;
}

function uniqueAnchors(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function canonicalReaderRoleDefinitionId(subscriptionId: string): string {
  return `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${readerRoleDefinitionGuid}`;
}

function assertApprovalReadyBindings(plan: ConnectivityRuntimePlan): void {
  const unresolved = plan.requiredContextAnchorIds.filter(id => id.includes('{') || id.includes('}'));
  if (unresolved.length > 0) {
    throw new Error(`Unresolved context binding IDs detected (${unresolved.length}). Awaiting refrozen resolved manifest.`);
  }

  const expectedByModel = buildVerifiedRealContextBindings(extractSubscriptionId(plan), extractResourceGroupName(plan));
  for (const entry of plan.readerGrantPlan) {
    const expectedScopes = uniqueAnchors(Object.values(expectedByModel[entry.modelName] ?? {}));
    const observedScopes = uniqueAnchors(entry.requiredContextAnchorIds);
    if (JSON.stringify(expectedScopes) !== JSON.stringify(observedScopes)) {
      throw new Error(`Binding scope mismatch for ${entry.modelName}. Expected provider-verified IDs only.`);
    }
  }
}

function extractSubscriptionId(plan: ConnectivityRuntimePlan): string {
  const target = plan.targetModelIds[0];
  const match = target.match(/^\/subscriptions\/([^/]+)\//i);
  if (!match) {
    throw new Error('Unable to derive subscription from target model IDs');
  }
  return match[1];
}

function extractResourceGroupName(plan: ConnectivityRuntimePlan): string {
  const target = plan.targetModelIds[0];
  const match = target.match(/\/resourceGroups\/([^/]+)\//i);
  if (!match) {
    throw new Error('Unable to derive resource group from target model IDs');
  }
  return match[1];
}

function applyVerifiedRealContextBindings(
  compiledCatalog: ConnectivityCompiledCatalog,
  subscriptionId: string,
  resourceGroupName: string,
): ConnectivityCompiledCatalog {
  const verifiedRealContextBindings = buildVerifiedRealContextBindings(subscriptionId, resourceGroupName);
  return {
    ...compiledCatalog,
    models: compiledCatalog.models.map(model => {
      const bindingOverrides = verifiedRealContextBindings[model.id];
      if (!bindingOverrides) {
        return model;
      }
      return {
        ...model,
        binding: {
          ...model.binding,
          resourceBindings: Object.fromEntries(
            Object.entries(model.binding.resourceBindings).map(([bindingKey, binding]) => [
              bindingKey,
              {
                ...binding,
                azureResourceId: bindingOverrides[bindingKey] ?? binding.azureResourceId,
              },
            ]),
          ),
        },
      };
    }),
  };
}

function buildVerifiedRealContextBindings(
  subscriptionId: string,
  resourceGroupName: string,
): Readonly<Record<ConnectivityModelId, Readonly<Record<string, string>>>> {
  return {
    'hm-demo-connectivity-alwaysonn-regional': {
      'regional-platform-root': resourceId(
        subscriptionId,
        resourceGroupName,
        'Microsoft.CloudHealth',
        'healthmodels',
        'hm-platform-swedencentral-001',
      ),
    },
    'hm-demo-connectivity-alwaysonn-vwan': {
      'vwan-platform-root': resourceId(
        subscriptionId,
        resourceGroupName,
        'Microsoft.Cdn',
        'profiles',
        'fd-alwaysonn',
      ),
    },
    'hm-demo-connectivity-alwaysonn-hybrid': {
      'hybrid-platform-root': resourceId(
        subscriptionId,
        resourceGroupName,
        'Microsoft.CloudHealth',
        'healthmodels',
        'hm-helloagents',
      ),
    },
    'hm-demo-connectivity-alwaysonn-dns': {
      'dns-platform-root': resourceId(
        subscriptionId,
        resourceGroupName,
        'Microsoft.DocumentDB',
        'databaseAccounts',
        'cosmos-alwaysonn-fiqhqx',
      ),
    },
  };
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '_');
}

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[key] = value;
  }
  return args;
}

function resolveCatalogDefinition(variant?: ConnectivityCatalogVariant) {
  if (variant === 'base') {
    return connectivityBaseCatalogDefinitions;
  }
  if (variant === 'expanded') {
    return connectivityExpandedP0CatalogDefinitions;
  }
  return connectivityCatalogDefinitions;
}

function modeRequiresTransport(mode: ConnectivityExecutionMode): boolean {
  return mode === 'preflight' || mode === 'apply' || mode === 'publish' || mode === 'verify' || mode === 'reset';
}

function createCliArmTransportFactory(plan: ConnectivityRuntimePlan): (allowedOperations: readonly AzureArmAllowedOperation[]) => ConnectivityTransport {
  const tenantId = process.env.AZURE_TENANT_ID;
  if (!tenantId) {
    throw new Error('AZURE_TENANT_ID is required for ARM transport');
  }
  const subscriptionId = extractSubscriptionId(plan);
  return (allowedOperations: readonly AzureArmAllowedOperation[]): ConnectivityTransport => {
    const adapter = createAzureArmTransport({
      tenantId,
      subscriptionId,
      allowedOperations,
    });
    return {
      request: adapter.request,
    };
  };
}

function buildAllowedOperationsForMode(input: {
  readonly mode: ConnectivityExecutionMode;
  readonly plan: ConnectivityRuntimePlan;
  readonly grant?: ConnectivityExecutionGrant;
  readonly modelName?: ConnectivityModelId;
  readonly sceneId?: string;
}): readonly AzureArmAllowedOperation[] {
  const operations: AzureArmAllowedOperation[] = [];
  const add = (method: 'GET' | 'PUT' | 'POST', idOrPath: string, apiVersion: string, allowSkipToken = false): void => {
    const path = idOrPath.startsWith('/subscriptions/') ? idOrPath : `/${idOrPath.replace(/^\/+/, '')}`;
    operations.push({ method, path, apiVersion, allowSkipToken });
  };

  for (const anchorId of uniqueAnchors(input.plan.requiredContextAnchorIds)) {
    add('GET', anchorId, resolveApiVersionForResourceId(anchorId));
  }
  for (const modelId of input.plan.targetModelIds) {
    add('GET', modelId, resolveApiVersionForResourceId(modelId));
  }

  if (input.mode === 'apply') {
    for (const model of input.plan.compiledCatalog.models) {
      const modelId = modelResourceIdFromName(model.id, input.plan.targetModelIds);
      add('PUT', modelId, healthModelApiVersion);
      for (const entity of model.entities) {
        add('PUT', `${modelId}/entities/${entity.id}`, healthModelApiVersion);
      }
      for (const relationship of model.relationships) {
        add('PUT', `${modelId}/relationships/${relationship.id}`, healthModelApiVersion);
      }
    }
  }

  if (input.mode === 'publish' || input.mode === 'verify' || input.mode === 'reset') {
    const scene = input.mode === 'reset'
      ? selectBaselineScene(input.plan, input.modelName)
      : selectScene(input.plan, input.modelName, input.sceneId);
    const modelId = modelResourceIdFromName(scene.modelName, input.plan.targetModelIds);
    for (const report of scene.reports) {
      add('GET', `${modelId}/entities/${report.entityId}`, healthModelApiVersion);
      if (input.mode !== 'verify') {
        add('POST', `${modelId}/entities/${report.entityId}/ingestHealthReport`, healthModelApiVersion);
      }
    }
    for (const omission of scene.omittedReports) {
      add('GET', `${modelId}/entities/${omission.entityId}`, healthModelApiVersion);
    }
  }

  return uniqueOperations(operations);
}

function uniqueOperations(operations: readonly AzureArmAllowedOperation[]): readonly AzureArmAllowedOperation[] {
  const seen = new Set<string>();
  const deduped: AzureArmAllowedOperation[] = [];
  for (const operation of operations) {
    const key = `${operation.method}|${operation.path}|${operation.apiVersion}|${operation.allowSkipToken ? '1' : '0'}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(operation);
  }
  return deduped;
}

if (require.main === module) {
  void (async () => {
    const args = parseArgs(process.argv.slice(2));
    const mode = (args.mode ?? 'plan') as ConnectivityExecutionMode;
    const catalogVariant = (args['catalog-variant'] ?? process.env.CONNECTIVITY_CATALOG_VARIANT ?? 'expanded') as ConnectivityCatalogVariant;
    const subscriptionId = args.subscriptionId ?? process.env.AZURE_SUBSCRIPTION_ID;
    const resourceGroupName = args.resourceGroup ?? process.env.AZURE_RESOURCE_GROUP;

    if (!subscriptionId || !resourceGroupName) {
      throw new Error('subscriptionId/resourceGroup (or AZURE_SUBSCRIPTION_ID/AZURE_RESOURCE_GROUP) are required');
    }
    if (catalogVariant !== 'base' && catalogVariant !== 'expanded') {
      throw new Error(`Invalid catalog variant '${catalogVariant}'. Use 'base' or 'expanded'.`);
    }

    const config = defaultConnectivityRuntimeConfig({ subscriptionId, resourceGroupName, catalogVariant });
    const plan = buildConnectivityRuntimePlan(config);
    const planDigest = createPlanDigest(plan);

    let grant: ConnectivityExecutionGrant | undefined;
    if (args['grant-file']) {
      grant = JSON.parse(readFileSync(resolve(args['grant-file']), 'utf8')) as ConnectivityExecutionGrant;
    }

    const armTransportFactory = modeRequiresTransport(mode) ? createCliArmTransportFactory(plan) : undefined;
    const allowedOperations = modeRequiresTransport(mode)
      ? buildAllowedOperationsForMode({
        mode,
        plan,
        grant,
        modelName: args.model as ConnectivityModelId | undefined,
        sceneId: args.scene,
      })
      : [];
    const transport = armTransportFactory ? armTransportFactory(allowedOperations) : undefined;
    const result = await executeConnectivityMode({
      mode,
      plan,
      transport,
      armTransportFactory,
      grant,
      modelName: args.model as ConnectivityModelId | undefined,
      sceneId: args.scene,
      outputPath: args.output,
      expectedOwnerSessionId: args.ownerSessionId,
    });

    const payload = {
      ...result,
      catalogVariant,
      planDigest,
      targetModelIds: plan.targetModelIds,
      readerGrantPlan: plan.readerGrantPlan,
      p0PostAllowlist: plan.p0PostAllowlist,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    if (result.verification === 'failed') {
      process.exit(1);
    }
  })().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
