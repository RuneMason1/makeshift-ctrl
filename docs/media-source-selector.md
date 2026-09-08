# Media source selector

LED candidate: firmware packet 31 accepts button, enabled, red, green, blue.
Firmware advertises MKSHFT_LED indicator=1; Ctrl sends only after this handshake.
Selector sensor 8 uses orange Auto, blue Local, green Chromecast. Firmware
adds 64 bytes of indicator state and uses the established fading/DMA driver.
Candidate builds; deployed via V2 updater on 2026-09-07. Updater reported success
and USB recovery on COM3. HEX SHA256:
FD991C83726B06DCA594C30FABEEABA19D32648AAE20293E0DD485B096D24019.
Source and HEX archived under Makeshift/.codex/checkpoints/2026-09-07-source-selector-led.
Physical LED colors and ten-second cold boot remain user-validation items.

Cues may request the system plugin and call system.media.cycleSource(). Modes
cycle Auto, Local PC, Chromecast. The user's cue maps sensor-8-button-pressed
(second-row left button) to this action. The selection is persisted in the
user profile's media-source.json. The upper text region shows the mode for two
seconds after toggling, then restores normal Now Playing text (or clears if idle).

Local prevents Home Assistant fallback. Chromecast consumes playback routing
even if unavailable, preventing accidental local control. Auto retains the
existing media selection policy. Local relative seeking is not implemented;
it reports unsupported rather than sending an action to Chromecast.

Implementation is in the shared Ctrl runtime loaded by V2. No firmware change
is required. Source changes require a runtime restart; reloading cues alone
does not load a new runtime implementation.

Outstanding: improve Auto paused-source retention and implement protected
carousel residency/restoration. Those requests are not completed by this change.
