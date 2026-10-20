# `az health-models-tui` - Health Models terminal monitor

![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Status](https://img.shields.io/badge/status-experimental-orange)
![Azure CLI](https://img.shields.io/badge/azure--cli-%3E%3D2.61.0-0078D4)

This extension provides a single command, `az health-models-tui`, with a read-only
model browser and monitor modes for Azure Monitor Health Models.

## Install

```bash
cd src/health-models-tui
uv sync --locked --python 3.11
uv build --wheel
WHEEL="$PWD/dist/health_models_tui-0.3.0-py3-none-any.whl"
AZURE_EXTENSION_DIR="$(mktemp -d)"
export AZURE_EXTENSION_DIR
az extension add --source "$WHEEL" --yes
az health-models-tui --help
```

If you reuse the same extension directory and the same version is already present,
`az extension add --source "$WHEEL"` can skip refreshing files. Use a fresh
`AZURE_EXTENSION_DIR` (as above), or remove/re-add the extension in that directory.
Keep running usage commands in the same shell session (or re-export
`AZURE_EXTENSION_DIR`) so bare `az health-models-tui ...` calls continue to use
the isolated extension path.

## Usage

```bash
# Default interactive mode: read-only model browser in the active subscription
az health-models-tui

# Browser scoped to one resource group (still read-only, no creation flow)
az health-models-tui -g myRg

# Direct monitor launch
az health-models-tui -g myRg --model myModel

# Direct monitor plain output mode
az health-models-tui -g myRg --model myModel --plain

# Non-TTY/no-model plain mode prints a finite model list
az health-models-tui --plain

# Poll every 10 seconds
az health-models-tui -g myRg --model myModel --poll-interval 10
```

## Keyboard shortcuts (Textual mode)

- `q` or `Ctrl+Q` quit
- `Ctrl+1` tree workspace tab
- `Ctrl+2` timeline workspace tab
- `Ctrl+3` changes workspace tab
- `F1` help dialog
- `F2` compact actions overlay (filterable, executable actions)
- `/` search
- `n` next match
- `p` previous match
- `Enter` expand/collapse the selected occurrence
- `r` refresh the launch model and the active nested model
- `d` entity details
- `v` verify signal
- `e` edit selected item (`QueryEditor` for signals, guided draft form for entities)
- `j` toggle auto-jump
- `+`/`-` adjust poll interval
- In Actions, `Up`/`Down` move selection (including from the filter input),
  `Enter` activates the focused action (or first visible match from filter focus),
  and `Esc` cancels and restores prior focus. Tab/Shift+Tab and click activation
  remain available.
- In text inputs and the query editor, letters and punctuation stay literal input.
  Global app shortcuts do not override typed text.
- Timeline tab provides range presets, UTC preview time, Previous/Next event,
  Open tree at preview, two-time compare, and Return to live controls.
- Timeline rows keep health glyphs and add state colors. Labels use display names
  when present, with canonical ID/name fallback.
- Changes tab provides guided draft field editing, local Save/Export/Restore/Discard,
  separate restore/apply confirmations, and a two-step live-only apply
  (prepare plan, then typed confirmation apply with read-back outcome).
- Quitting with unsaved drafts opens Save/Discard/Cancel guard actions (Cancel default).

## Notes

- Uses the current Azure CLI account and subscription context.
- In non-TTY output, the command automatically falls back to plain-text output.
- Browser mode is read-only. It lists models in the active subscription, supports
  optional `-g` filtering, and exposes no creation flow.
- Browser-launched monitors include guarded **Back to models** through Actions.
  Direct `-g --model` launches keep existing quit behavior and do not expose Back.
- `uv run az ...` executes the `az` found in your PATH, and Azure CLI uses its own
  interpreter for extension loading. Validate extension behavior via wheel install
  and `az health-models-tui --help`, not by assuming uv's environment is used by `az`.

## Tests

```bash
cd src/health-models-tui
uv run --locked python -m pytest azext_health_models_tui/tests/
```

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
