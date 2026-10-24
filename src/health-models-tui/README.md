# `az health-models-tui` - Health Models terminal monitor

![Version](https://img.shields.io/badge/version-0.4.0-blue)
![Status](https://img.shields.io/badge/status-experimental-orange)
![Azure CLI](https://img.shields.io/badge/azure--cli-%3E%3D2.61.0-0078D4)

One command, `az health-models-tui`, to browse Azure Monitor Health Models, watch
their health live, look back in time, and make guarded edits.

## Install

The extension is not published to the Azure CLI extension index. Build it from a
fresh clone of the public repository and add the wheel to your Azure CLI.

Requires Azure CLI 2.61.0 or newer (with Python 3.11+), `git`, and
[`uv`](https://docs.astral.sh/uv/getting-started/installation/).

```bash
TMP="$(mktemp -d)"
git clone --depth 1 https://github.com/abossard/always-on-v2.git "$TMP/always-on-v2"
(cd "$TMP/always-on-v2/src/health-models-tui" && uv build --wheel)
az extension add --source "$TMP"/always-on-v2/src/health-models-tui/dist/health_models_tui-*.whl --yes
git -C "$TMP/always-on-v2" log -1 --format='Installed commit %h (%cs)'
rm -rf "$TMP"
az health-models-tui --help
```

`--yes` skips the prompt for an extension from an unofficial source. `az login` must
have been run for the subscription you want to browse.

## Update

Builds between releases share one version number, so `az extension add` (with or
without `--upgrade`) only prints `already installed` and keeps the old files.
Remove the extension first, then add a freshly built wheel:

```bash
TMP="$(mktemp -d)"
git clone --depth 1 https://github.com/abossard/always-on-v2.git "$TMP/always-on-v2"
(cd "$TMP/always-on-v2/src/health-models-tui" && uv build --wheel)
az extension remove --name health-models-tui
az extension add --source "$TMP"/always-on-v2/src/health-models-tui/dist/health_models_tui-*.whl --yes
git -C "$TMP/always-on-v2" log -1 --format='Installed commit %h (%cs)'
rm -rf "$TMP"
```

## Uninstall

```bash
az extension remove --name health-models-tui
```

## Local development build

From the root of a checkout, install into an isolated extension directory so your
regular Azure CLI extensions stay untouched:

```bash
cd src/health-models-tui
uv build --wheel
AZURE_EXTENSION_DIR="$(mktemp -d)"
export AZURE_EXTENSION_DIR
az extension add --source dist/health_models_tui-*.whl --yes
az health-models-tui --help
```

Keep running usage commands in the same shell session (or re-export
`AZURE_EXTENSION_DIR`) so bare `az health-models-tui ...` calls keep using the
isolated extension path. To load a rebuilt wheel there, run
`az extension remove --name health-models-tui` before adding it again (see Update).

## Usage

```bash
az health-models-tui                              # pick a model from the active subscription
az health-models-tui -g myRg                      # pick a model from one resource group
az health-models-tui -g myRg --model myModel      # open a model directly
az health-models-tui -g myRg --model myModel --plain --poll-interval 10
```

Without a TTY (or with `--plain`) the command prints plain text instead of the UI.
It uses the current `az login` account and subscription.

## Keys

| Key | Action |
|---|---|
| `↑` `↓` `Enter` | move, expand or collapse |
| `d` / `v` / `e` | details / verify signal / edit (query editor for signals, draft form for entities) |
| `/` then `n` `p` | search, next and previous match |
| `1` `2` `3` | Tree, Timeline, Changes tabs (`Ctrl+1`..`3` where the terminal sends them) |
| `r` / `j` / `+` `-` | refresh / toggle auto-jump to escalations / poll interval ±10 s |
| `F1` / `F2` | all keys / filterable actions (includes Back to models when launched from the list) |
| `Esc` / `q` | close panel / quit (asks before discarding unsaved drafts) |

## Timeline

Rows fill in as their history arrives; rows still loading show a moving bar and the
progress line counts them. There is no timeout. Color shows the worst health state
in each time slot. For a selected signal, bar height shows its value. `·` marks
time without data. Use Prev/Next to step through events, **Open tree at time**
to see the model at that time (the status bar then says **Snapshot**), and
**Compare** to diff two times.

## Changes

Edits are local drafts until you apply them. Save (or Overwrite) writes a draft to
a JSON file; Restore loads one back. Applying is a two-step flow: **Prepare apply** reads the live resource and
shows the tenant, subscription and changed fields, then **Apply prepared** writes
after you type the resource name, and reads the result back.

## Nested models

A reference to another health model starts collapsed. Expanding it loads that one
model with your own credentials; a missing permission only affects that row.
Repeated references share one cached copy, and cycles are marked.

## Tests

```bash
cd src/health-models-tui
uv run --locked pytest -q
```
