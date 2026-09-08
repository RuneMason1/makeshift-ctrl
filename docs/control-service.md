# Ctrl Control Service

The Ctrl control service is the single MakeShift runtime. It starts with the
desktop window, and closing that window hides Ctrl to the tray without stopping
the service. Reopening the window reconnects to that same in-process service;
no second Ctrl or serial owner is created.

## Migration rule

The current `MakeShiftAgent` remains authoritative until it is refactored to
run this service and direct-art protocol parity is device-tested. These source
files do not start a process, open a serial port, or alter the Systray launcher.

## Protocol rule

Select the artwork adapter from firmware capability data. Current firmware is
the seven-slot direct RGB565 protocol. Keyed cache support requires a matched
future firmware and Ctrl release.

## Artwork Core

`AssetStore` and `TransferScheduler` are provider-neutral shared-core
primitives. Providers publish immutable prepared RGB565 variants under strong
asset keys; the scheduler leases a host-RAM buffer and gives selected work
priority over neighbor and optional preload work. Disk may hydrate this store,
but it is never a selected-card transfer dependency.

`LegacyArtworkResidency` contains the only current-firmware constraint: seven
physical direct-art slots. It is shared across providers and resets whenever
Core opens a different carousel session or loses the device connection.

These primitives are staged only. The active agent remains the serial owner
until Ctrl reaches parity and device behavior is validated.
