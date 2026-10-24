.. :changelog:

Release History
===============

0.4.0
+++++
* Timeline fills in row by row with a loading indicator and no timeout; bands use colored blocks (color = worst state, height = signal value).
* Layout: compact Timeline controls, highlighted active tab, short UTC timestamps, a status bar that never breaks words, full-width side panes below 100 columns.
* Signal panel shows the service-side error and treats unsupported Log Analytics verification as information.
* Changes tab follows the draft you changed last; Prepare and Apply run in the background and keep edits made meanwhile; quitting waits for a running write; the quit dialog works from the keyboard.
* ``1`` ``2`` ``3`` switch tabs (Ctrl+digit rarely reaches terminal apps); Help lists every key from the bindings; the status bar marks an open snapshot.
* Fixes for live models: inline signals show their names, units and thresholds; Prepare no longer reports a stale baseline because of Resource Health status; malformed or non-finite history fails only its row.
* Data-source query errors and entity 404s are reported as typed errors.
* Metric and Prometheus verification use the configured cloud endpoint instead of the public Azure host.
* The wheel no longer ships a stale copy of the package from a local ``build/`` directory.
