# `az health-models-tui` - Health Models terminal monitor

![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Status](https://img.shields.io/badge/status-experimental-orange)
![Azure CLI](https://img.shields.io/badge/azure--cli-%3E%3D2.61.0-0078D4)

This extension provides a single command, `az health-models-tui`, to monitor an Azure Monitor Health Model in Textual or plain-text mode.

## Install

```bash
cd src/health-models-tui
python -m pip install build==1.6.1 -q
python -m build --wheel -q
az extension add --source dist/health_models_tui-*.whl --upgrade --yes
```

## Usage

```bash
# Interactive mode
az health-models-tui -g myRg --model myModel

# Plain output mode
az health-models-tui -g myRg --model myModel --plain

# Poll every 10 seconds
az health-models-tui -g myRg --model myModel --poll-interval 10
```

## Keyboard shortcuts (Textual mode)

- `q` quit
- `/` search
- `n` next match
- `p` previous match
- `Enter` expand/collapse the selected occurrence
- `r` refresh the launch model and the active nested model
- `d` entity details
- `v` verify signal
- `e` query editor
- `j` toggle auto-jump
- `+`/`-` adjust poll interval

## Notes

- Uses the current Azure CLI account and subscription context.
- In non-TTY output, the command automatically falls back to plain-text output.

## Nested models

Model-root references start collapsed and unloaded. Expanding one loads that model,
not its descendants. Repeated references retain separate tree paths but share one
complete cached snapshot, including across resource groups and subscriptions.
Cycles are marked as links. Entity-specific and other subresource references are
visibly unsupported and are not fetched.

Each reference shows queued, checking, loading, cached, stale or failed state,
capture time and target errors. The status bar includes the root and unique model
work counts. Two monitor jobs can run at once, with one job per model. Explicit
navigation/manual refresh has priority, followed by the due root poll, then
active-model polling and health invalidations. Nearby visible occurrences win
within a priority; ties retain queue order.

Unchanged reference health never triggers an inactive nested refresh, even when
signal values or timestamps change. A changed observation first checks the
target's named root entity. Only changed authoritative root health authorizes a
background full reload. Stable conflicting aliases are acknowledged rather than
repeatedly probed. A parent refresh checks only its own references, not all
descendants. Cached capture times do not imply that hidden internal changes have
been observed.

Entering a cached model shows its snapshot immediately and requests one refresh
per activation. Moving within that model coalesces; the normal shared timer can
refresh it while active. Collapsing preserves the cache and removes unwanted
queued navigation work. Failed refreshes retain the last complete snapshot.

Search includes reachable cached models and identifies unloaded scope without
crawling it. Results include model/path context. Details, verification, history
and test-only query editing use the selected occurrence's scope. Plain mode
reports references and loading states without opening nested models.

Nested reads use the current user's Azure CLI credentials without switching the
active account. Access to a parent model does not grant access to its targets.
Permission errors stay local to that target.
