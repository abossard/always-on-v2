# Search Feature Plan (`/` to find entities & signals)

## Overview

Press `/` to open a search modal. Type to filter entities and signals in-memory. Navigate results with arrow keys, press Enter to jump to the item in the tree. Search state persists after closing — use `n`/`p` to cycle through matches.

---

## Architecture (Grokking Simplicity alignment)

### Data Layer (`models/`)

- Add `SearchResult` frozen dataclass to `domain.py`:
  - `entity_id: str`
  - `display_name: str`
  - `is_signal: bool`
  - `health_state: HealthState`
  - `signal_value: str | None` (formatted value for signals)
  - `parent_entity_id: str | None` (for signals, to resolve tree node)

### Calculation Layer (`domain/`)

- New module: `domain/search.py`
- Pure function: `search_forest(forest: Forest, query: str) -> list[SearchResult]`
  - Case-insensitive prefix/substring match on `display_name`
  - Starts matching from first character typed
  - Returns both entities and signals, annotated with type
  - Sorted: entities first, then signals; within group by match quality (prefix > contains)

### Widget Layer (`watch/`)

#### New: `SearchModal` (`watch/search_modal.py`)

- Textual `ModalScreen` overlay:
  - `Input` widget for search string (pre-selected text on reopen)
  - `OptionList` for results
- Result rendering reuses `format_entity_label` / `format_signal_label` from formatters
- Keyboard handling:
  - `Up/Down` — navigate result list
  - `Enter` — select item, close modal, jump in tree
  - `Escape` — close modal (keeps search state)
  - `Ctrl+A` — cursor to start (emacs home)
  - `Ctrl+E` — cursor to end (emacs end)
  - `Left/Right` — deselect text, allow editing
  - `Backspace` on selected text — clear entire query

#### Modified: `HealthWatchApp` (`watch/app.py`)

- New app state:
  - `_search_results: list[SearchResult]` — persists after modal close
  - `_search_query: str` — persists after modal close
  - `_search_cursor: int` — current position in result list for `n`/`p` navigation
- New bindings:
  - `/` → `action_open_search()` — opens modal with previous query pre-selected
  - `n` → `action_next_match()` — jump to next result in tree (only when search results exist)
  - `p` → `action_prev_match()` — jump to prev result in tree (only when search results exist)

#### Modified: `StatusBar` (`watch/status_bar.py`)

- Dynamic key hints — only show shortcuts that currently do something
- New reactive: `has_search_results: reactive[bool]`
- When `has_search_results` is True → show `n Next  p Prev` in hints
- Always show: `/ Search`
- Existing hints remain

#### Modified: `styles.tcss`

- Add styling for search modal overlay, input, and result list

---

## State Flow

```
User presses /
  → SearchModal opens (pre-filled with previous query, text selected)
  → User types → search_forest(forest, query) called on each keystroke
  → Results rendered with entity/signal formatting + health colors
  → User presses Enter on result
  → Modal closes → tree.scroll_to_entity(selected.entity_id)
  → _search_results + _search_query stored in app state
  → StatusBar updated to show n/p hints

User presses n/p (when search results exist)
  → _search_cursor incremented/decremented (wraps around)
  → tree.scroll_to_entity(results[cursor].entity_id)
```

---

## Files to Create

| File | Purpose |
|---|---|
| `domain/search.py` | Pure `search_forest()` function |
| `watch/search_modal.py` | Textual modal screen for search UI |

## Files to Modify

| File | Changes |
|---|---|
| `models/domain.py` | Add `SearchResult` dataclass |
| `watch/app.py` | Add `/`, `n`, `p` bindings; search state; modal orchestration |
| `watch/status_bar.py` | Dynamic hints based on `has_search_results` |
| `watch/styles.tcss` | Styling for search modal + result list |
| `watch/health_tree.py` | Ensure `scroll_to_entity` works for signal parent entities |

---

## Key Design Decisions

- **In-memory search** — `search_forest()` walks `Forest.entities` dict, no index needed (small dataset, instant)
- **Reuse formatters** — result rendering uses same `format_entity_label` / `format_signal_label` for visual consistency
- **Persistent search state** — query + results survive modal close; `n`/`p` work globally
- **Text selection on reopen** — Textual `Input` supports `.select_all()` natively
- **Emacs bindings** — Textual `Input` already supports `Ctrl+A`/`Ctrl+E` by default
- **Dynamic status bar** — only show `n`/`p` hints when there are search results to navigate
