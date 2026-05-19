# Health Model Brief — {{APP_NAME}}

> Fill in this brief after the discovery phase exports your resources.
> The architecture and design phases read this file to build your health model.
> Delete or leave blank any section that doesn't apply — defaults are listed in §9.

---

## 1. Your Role & Responsibilities

- **Role**: <!-- e.g., SRE, Platform Engineer, App Dev Lead -->
- **Team**:
- **Scope**: <!-- e.g., "Full stack owner", "Data platform only", "AKS clusters + ingress" -->
- **Escalation**: <!-- Who gets paged when this health model goes red? -->

---

## 2. Critical User Journeys

<!-- What are users actually doing? Health models should reflect user impact, not just infra. -->

| Journey | Depends on | Impact if broken | Priority |
|---------|------------|------------------|----------|
| <!-- e.g., User login --> | <!-- App Service, Key Vault --> | <!-- Users locked out --> | <!-- H/M/L --> |
| | | | |
| | | | |

---

## 3. SLO / SLA Targets

| Service / Journey | Metric | Target | Window | Source | What counts as failure |
|-------------------|--------|--------|--------|--------|----------------------|
| <!-- e.g., Checkout API --> | <!-- P95 latency --> | <!-- < 500ms --> | <!-- 5 min rolling --> | <!-- App Insights --> | <!-- > 500ms or timeout --> |
| <!-- e.g., Overall API --> | <!-- Availability --> | <!-- 99.95% --> | <!-- Monthly --> | <!-- Synthetic test --> | <!-- non-2xx or timeout > 5s --> |
| | | | | | |

- **Composite SLO**: <!-- yes / no — should the root entity reflect a single "system healthy?" answer? -->
- **Error budget policy**: <!-- e.g., "freeze deploys at < 20% budget" — or leave blank -->

---

## 4. Top Concerns

<!-- Rank 1-5. These drive which signals get highest priority and tightest thresholds. -->

1.
2.
3.
4.
5.

<details><summary>Examples to pick from</summary>

- Data loss or corruption
- High latency for end users
- Cascading failures across stamps
- AI service throttling during peak
- Cost overrun from autoscaling
- Noisy alerts drowning real issues
- Silent failures (system broken but no alert)
- Certificate expiry
- Dependency on a single region
- Deployment breaking production

</details>

---

## 5. What to Observe

<!-- Generated from discovery. Check [x] to include, set priority H/M/L. -->
<!-- Add rows for anything the discovery missed. -->

| Include | Resource | Type | Suggested signals | Priority | Notes |
|---------|----------|------|-------------------|----------|-------|
| | <!-- filled by discovery --> | | | | |

---

## 6. Alert Philosophy

- **Sensitivity**: <!-- `quiet` = only critical / `balanced` = reasonable defaults / `noisy` = catch everything early -->
- **Audience**: <!-- NOC dashboard / team Grafana / executive summary / on-call rotation -->
- **On Degraded**: <!-- page / Slack notify / dashboard only -->
- **On Unhealthy**: <!-- page immediately / create incident / auto-remediate -->

---

## 7. Stamp & Regional Behavior

- **Independent stamp health?**: <!-- yes = each stamp gets its own entity subtree / no = flat -->
- **Stamps equally important?**: <!-- yes / no — if no, which is primary? -->
- **One stamp down = ?**: <!-- `Degraded` (system still up) / `Unhealthy` (system broken) -->

---

## 8. Environment & Exclusions

- **Environments to include**: <!-- prod / staging / both -->
- **Exclude resources matching**: <!-- e.g., "dev-*", "test-*" -->
- **Out-of-scope resources**: <!-- List anything discovered that should NOT be in the health model -->

---

## 9. Defaults If Left Blank

> The skills will assume the following for any section you skip.
> If these defaults are wrong for you, fill in the section above.

| Section | Default assumption |
|---------|-------------------|
| Role / scope | Full-stack operator; all discovered resources in scope |
| User journeys | Derived from resource dependencies (infra-shaped, not user-shaped) |
| SLO targets | Conservative service defaults from signal catalog |
| Top concerns | Availability > Latency > Errors > Saturation |
| What to Observe | All production-looking resources at Medium priority |
| Sensitivity | Balanced |
| Stamp behavior | Independent per stamp; one down = Degraded |
| Environment | Production only; exclude resources tagged dev/test |
