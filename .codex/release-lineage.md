# MakeShift Release Lineage

Mirrored in `makeshift-firmware`, `makeshift-ctrl`, `makeshift-msg`, and
`makeshift-serial`. Update all copies before every coordinated release push.

## Current unpaired state

| Component | Branch | Commit |
| --- | --- | --- |
| Firmware | `stabilization/led-ui-hardening` | `e02ee82035e7d3e14144106ba52d1692e75f8a2e` |
| Ctrl | `modernize/ctrl-2026` | `be2bab84986f55e2ebeffd0d505e23708d15cbde` |
| Msg | `main` | `1f941dbf7235951b060f3be7d2fc9e53cb78771d` |
| Serial | `agent/binary-display-packets` | `2ba800e00303601a0995de582b7c1d1b5f63fcc4` |
| Agent companion | `systray-widget/main` | `63141a3` |

Current local/flashed firmware HEX SHA-256:
`0ef975629f22743b7f33a7ccfbb2a79111d2cece7734f89d1919acdd421416c2`

Status: unpaired. The archive checksum still needs correction, the private cue
manifest is not recorded, and the required physical cold-boot validation is
pending.

## 2026-09-06 Offline controller hardening

- Confirmed the actual flashed image is the hardware-approved LED/UI rollback
  checkpoint, not the untested keyed-cache candidate.
- Centralized cache protocol v2 packet IDs in `cacheProtocol.mjs`: begin 27,
  chunk 28, commit 29, bind 30. The values are covered by the core tests to
  prevent a repeat of the host/firmware packet-ID mismatch.
- Added regression coverage for replacing a slow carousel session and for
  aborting a stale direct-art transfer before commit.
- Removed a duplicate `CACHE_PROTOCOL_VERSION` declaration found by the
  runtime syntax check. Core tests and syntax validation pass.
- The PlatformIO shortcut is absent, but the pinned toolchain is available via
  `py -m platformio`: Core 6.1.19, Teensy platform 4.18.0, Teensyduino 1.58,
  and GCC 11.3.1. The conservative candidate rebuilt successfully with the
  LED-good RAM2 layout and SHA-256
  `A8CA3732ED54A127488E70B6C42DF0D0D9E9E8789BC4CBE7D40D442321C1A7F0`.
  It remains unflashed pending an explicitly approved physical cold-boot test.

## 2026-09-06 Cache protocol 3 candidate

- Added request-correlated firmware ACK tracking for cache begin, commit, and
  bind. Ctrl rejects matching firmware errors, times out missing replies, and
  clears pending waits on disconnect.
- The source-only firmware companion advertises cache protocol 3 and preserves
  the LED-good seven-slot cache/256-byte SLIP layout. Its build SHA-256 is
  `77DC59F98D2D66C106610F081454F768E7D69F5EC21EF4D88544828E950C1CE5`.
- Thirteen core tests and runtime syntax validation pass. This candidate is
  unflashed and requires an explicit cold-boot LED A/B approval.

## 2026-09-06 Carousel source refresh

- Ctrl refreshes the Steam catalog and Plex Continue Watching feed every five
  minutes, then prepares their artwork in host storage for later carousel use.
- Open carousel sessions remain immutable; refreshed ordering and content apply
  when a carousel is next opened, preventing a mid-scroll selection from being
  rebound to another item.
- Plex asset identities are invalidated before each feed refresh so updated
  poster art is not retained merely because its rating key is unchanged.

## 2026-09-06 Integrated updater fallback

- The V2 firmware updater now uses `py -m platformio run -t upload` when an
  explicit or installed `platformio.exe` is unavailable. It retains the
  controller-owned serial yield/resume lifecycle rather than competing for
  COM3 outside Ctrl.

## Release rule

Before every coordinated push, update this file in all four repositories with
the exact component commits, agent companion commit, published HEX path and
SHA-256, private cue-manifest SHA-256, protocol result, and cold-boot result.
Then create the same annotated `lineage/<id>` tag in all four repositories.
