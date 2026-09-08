# Relative seek review

Superseding safety rule: no predicted positions are used. Ctrl requests an HA
entity update and accepts only a position timestamp at or after that request,
no more than two seconds old, and newer than the previous successful seek.
Refusals log media-seek-withheld. This intentionally sacrifices availability
when the provider cannot deliver a fresh sample. It cannot prove that the
provider's timestamp accurately represents a device measurement. The HA
plex_carousel/status endpoint exposes handoff state only, not a live timeline.

Confirmed defect: repeated commands reused an unchanged Home Assistant position,
so a second backward seek repeated the first absolute target.

Added RelativeSeek to the shared Ctrl runtime imported by agent V2. Successful
targets are reused for up to 15 seconds while the provider repeats its position.
Changed media, changed position, transport actions, and disconnect reset this
prediction. Failed requests do not commit a predicted target. Diagnostics include
the reported position and whether a successful local seek was reused.

Sixteen core tests passed, including repeated backward seeks, reversal, failures,
different players, media changes, and expiry. This is a targeted fix, not proof
that every provider position is fresh or every accepted seek reached the player.
Hardware validation and activation remain pending. No firmware flash or remote
push performed. Broader firmware/protocol review remains outstanding.
