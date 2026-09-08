# Ctrl Modernization Contract

## Preserve

- Existing cue files, user cue folders, configuration and Blockly workspaces.
- Code and Blockly authoring as equal supported workflows.
- Event assignment, layout editing, device inspection, terminal, preferences,
  plugins, firmware workflow and existing IPC compatibility during migration.

## Modernize

- Make Core the typed runtime boundary; remove frontend assumptions that Ctrl
  itself owns a serial port.
- Replace implicit shared mutable UI state with typed Core snapshots/events.
- Introduce an accessible responsive workspace shell around the existing
  authoring panels instead of replacing them.
- Treat the device preview, active mappings, Core health, and diagnostics as
  first-class surfaces alongside the cue editor.
- Keep the desktop app usable without the device connected; authoring and
  validation must not require COM3.

## Guardrails

- No migration may rewrite or discard a user cue/workspace automatically.
- New Core views are additive until the existing editor feature has an
  equivalent tested replacement.
- The active private agent remains rollback authority until Ctrl/Core parity is
  verified on the actual device.
