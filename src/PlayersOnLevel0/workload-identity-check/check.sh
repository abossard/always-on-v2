#!/usr/bin/env bash
# ============================================================================
# Workload Identity Verifier
# Run as an init container to validate the full Azure Workload Identity chain
# before the application starts. Gives detailed diagnostics on failure.
#
# Checks:
#   1. Projected service account token exists
#   2. Token is a valid JWT with correct claims
#   3. AZURE_CLIENT_ID and AZURE_TENANT_ID are injected
#   4. OIDC token exchange succeeds (gets Azure access token)
#   5. (Optional) Cosmos DB endpoint is reachable
#
# Exit 0 = all good, pod starts
# Exit 1 = something is wrong, pod stays in Init:Error
# Set SKIP_IDENTITY_CHECK=true to bypass (e.g., minikube)
# ============================================================================
set -euo pipefail

TOKEN_PATH="${AZURE_FEDERATED_TOKEN_FILE:-/var/run/secrets/azure/tokens/azure-identity-token}"
PASS="✅"
FAIL="❌"
WARN="⚠️"
errors=0

echo "═══════════════════════════════════════════════════════"
echo "  Workload Identity Verifier"
echo "═══════════════════════════════════════════════════════"
echo ""

# --- Skip check ---
if [[ "${SKIP_IDENTITY_CHECK:-false}" == "true" ]]; then
  echo "$WARN  SKIP_IDENTITY_CHECK=true — skipping all checks"
  exit 0
fi

# --- Check 1: Projected token file ---
echo "1. Projected Service Account Token"
if [[ -f "$TOKEN_PATH" ]]; then
  TOKEN=$(cat "$TOKEN_PATH")
  TOKEN_SIZE=${#TOKEN}
  echo "   $PASS Token file exists: $TOKEN_PATH ($TOKEN_SIZE bytes)"
else
  echo "   $FAIL Token file NOT FOUND: $TOKEN_PATH"
  echo "   → The workload identity webhook did not inject the projected token."
  echo "   → Verify: Pod has label 'azure.workload.identity/use: true'"
  echo "   → Verify: ServiceAccount has annotation 'azure.workload.identity/client-id'"
  echo "   → Verify: AKS has workload identity enabled"
  errors=$((errors + 1))
  TOKEN=""
fi
echo ""

# --- Check 2: Decode JWT ---
echo "2. JWT Token Claims"
if [[ -n "${TOKEN:-}" ]]; then
  # Decode JWT payload (base64url → base64 → json)
  PAYLOAD=$(echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null || echo "")
  if [[ -n "$PAYLOAD" ]] && echo "$PAYLOAD" | python3 -m json.tool >/dev/null 2>&1; then
    ISS=$(echo "$PAYLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('iss','?'))" 2>/dev/null)
    SUB=$(echo "$PAYLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sub','?'))" 2>/dev/null)
    AUD=$(echo "$PAYLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('aud','?'))" 2>/dev/null)
    EXP=$(echo "$PAYLOAD" | python3 -c "import sys,json; import datetime; print(datetime.datetime.fromtimestamp(json.load(sys.stdin).get('exp',0)).isoformat())" 2>/dev/null)

    echo "   $PASS Valid JWT"
    echo "   issuer:   $ISS"
    echo "   subject:  $SUB"
    echo "   audience: $AUD"
    echo "   expires:  $EXP"

    # Validate subject format
    if [[ "$SUB" == system:serviceaccount:* ]]; then
      echo "   $PASS Subject is a Kubernetes service account"
    else
      echo "   $FAIL Subject is NOT a service account: $SUB"
      errors=$((errors + 1))
    fi
  else
    echo "   $FAIL Could not decode JWT payload"
    errors=$((errors + 1))
  fi
else
  echo "   $WARN Skipped (no token)"
fi
echo ""

# --- Check 3: Webhook-injected env vars ---
echo "3. Webhook-Injected Environment Variables"
for VAR in AZURE_CLIENT_ID AZURE_TENANT_ID AZURE_FEDERATED_TOKEN_FILE AZURE_AUTHORITY_HOST; do
  VAL="${!VAR:-}"
  if [[ -n "$VAL" ]]; then
    # Mask sensitive values
    if [[ "$VAR" == "AZURE_CLIENT_ID" ]]; then
      echo "   $PASS $VAR = $VAL"
    else
      echo "   $PASS $VAR = ${VAL:0:30}..."
    fi
  else
    if [[ "$VAR" == "AZURE_AUTHORITY_HOST" ]]; then
      echo "   $WARN $VAR not set (optional)"
    else
      echo "   $FAIL $VAR not set"
      echo "   → The workload identity webhook did not inject this variable."
      errors=$((errors + 1))
    fi
  fi
done
echo ""

# --- Check 4: OIDC Token Exchange ---
echo "4. OIDC Token Exchange (SA token → Azure access token)"
if [[ -n "${TOKEN:-}" ]] && [[ -n "${AZURE_CLIENT_ID:-}" ]] && [[ -n "${AZURE_TENANT_ID:-}" ]]; then
  AUTHORITY="${AZURE_AUTHORITY_HOST:-https://login.microsoftonline.com}"
  RESPONSE=$(curl -sS --max-time 10 \
    "${AUTHORITY}/${AZURE_TENANT_ID}/oauth2/v2.0/token" \
    -d "grant_type=client_credentials" \
    -d "client_id=${AZURE_CLIENT_ID}" \
    -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
    -d "client_assertion=${TOKEN}" \
    -d "scope=https://management.azure.com/.default" \
    2>&1 || echo '{"error":"request_failed"}')

  if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'access_token' in d" 2>/dev/null; then
    EXPIRES_IN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('expires_in','?'))" 2>/dev/null)
    echo "   $PASS Token exchange succeeded (expires_in: ${EXPIRES_IN}s)"
  else
    ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error_description', d.get('error','unknown')))" 2>/dev/null || echo "$RESPONSE")
    echo "   $FAIL Token exchange FAILED"
    echo "   → Error: $ERROR"
    echo "   → Verify: Federated credential exists in Azure for this identity"
    echo "   → Expected subject: system:serviceaccount:<namespace>:<sa-name>"
    echo "   → OIDC issuer must match the AKS cluster's issuer URL"
    errors=$((errors + 1))
  fi
else
  echo "   $WARN Skipped (missing token or env vars)"
fi
echo ""

# --- Check 5: Optional Cosmos DB connectivity ---
echo "5. Azure Resource Connectivity"
if [[ -n "${CosmosDb__Endpoint:-}" ]]; then
  echo "   Testing Cosmos DB: ${CosmosDb__Endpoint}"
  HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${CosmosDb__Endpoint}" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "200" ]]; then
    echo "   $PASS Cosmos DB reachable (HTTP $HTTP_CODE — auth handled by SDK)"
  elif [[ "$HTTP_CODE" == "000" ]]; then
    echo "   $FAIL Cosmos DB unreachable: ${CosmosDb__Endpoint}"
    echo "   → Check network connectivity and firewall rules"
    errors=$((errors + 1))
  else
    echo "   $WARN Cosmos DB returned HTTP $HTTP_CODE"
  fi
else
  echo "   $WARN CosmosDb__Endpoint not set — skipping"
fi
echo ""

# --- Summary ---
echo "═══════════════════════════════════════════════════════"
if [[ $errors -eq 0 ]]; then
  echo "  $PASS All checks passed — workload identity is configured correctly"
  echo "═══════════════════════════════════════════════════════"
  exit 0
else
  echo "  $FAIL $errors check(s) failed — see details above"
  echo ""
  echo "  Troubleshooting:"
  echo "  1. kubectl describe sa <sa-name> -n <namespace>"
  echo "  2. az identity federated-credential list --name <identity> -g <rg>"
  echo "  3. az aks show -n <cluster> -g <rg> --query oidcIssuerProfile"
  echo "═══════════════════════════════════════════════════════"
  exit 1
fi
