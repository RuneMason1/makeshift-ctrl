# Core V2 Device Regression Gate

This is the approval-required test plan for the staged `MakeShiftCoreAgent`
host. It does not authorize starting V2, stopping the live agent, changing
firmware, or flashing the device by itself.

## Preconditions

- `npm run test:core` and `npm run typecheck` pass from `makeshift-ctrl`.
- The current Systray `MakeShiftAgent` is confirmed running and its current
  package remains the rollback authority.
- No firmware flash is part of this trial. The paired legacy firmware remains
  the already-proven working image.
- The device is physically available and the user explicitly approves stopping
  the live agent and launching V2.

## Trial

1. Record the live agent's status and current log timestamp.
2. Stop only the live MakeShift agent process; do not stop or restart the
   Systray widget itself.
3. Start V2 once, with the same Ctrl root, host resources, user config, cues,
   plugins, and log directory.
   V2 must acquire the Core named pipe before it starts serial discovery; if
   the live agent still owns that pipe, V2 exits without attempting to own COM3.
4. Confirm one serial owner and a clean connection. The display, LED startup
   sequence, status zones, and Now Playing must appear without manual input.
5. Test button input, long press, dial events, media target behavior, GoXLR,
   lighting controls, and disconnect/reconnect.
6. Open Steam and Plex carousels separately, then switch rapidly between them.
   Verify selected artwork arrives before background preload and no image/title
   pair crosses carousel boundaries.
7. Review Core status plus transfer logs for stale cancellation, queue order,
   slot residency, and failed direct-art transactions.

## Stop And Roll Back

Stop the V2 process immediately and restart the live MakeShift agent if any of
the following happens: missing input, duplicate serial ownership, a frozen or
white screen, LED instability, failed reconnect, incorrect media action, or
artwork from one carousel shown for another. Do not flash firmware while
diagnosing a V2-host failure.

V2 treats an aborted serial write during a physical reconnect as an in-process
scan-recovery event. The live agent retains its existing supervised-restart
behavior; this distinction is intentional and must be verified in the trial.

## Success Gate

V2 is eligible for a limited daily-use trial only after a clean boot,
disconnect/reconnect, both carousel flows, rapid switching, and the normal
media/GoXLR/lighting controls pass in one session. The live agent remains the
rollback path until repeated normal-use sessions pass.
