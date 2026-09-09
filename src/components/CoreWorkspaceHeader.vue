<script setup lang="ts">
import { inject, type Ref } from 'vue'
import type { View } from '../renderer'

type CoreStatus = { attached: boolean; core: boolean; connected: boolean; firmwareUpdateInProgress: boolean; serial: { yielded: boolean; recoveryPending: boolean }; cueCount: number; mappingCount: number; activeCarousel?: { id: string; sessionId: number } | null; reason?: string }

const selectedView = inject('selected-view') as Ref<View>
const status = inject('core-status') as Ref<CoreStatus>

async function selectView(view: View) {
  selectedView.value = view
  await window.MakeShiftCtrl.set.currentView(view)
}
</script>

<template>
  <header class="workspace-header">
    <div class="wordmark">
      <span class="mark">M//S</span>
      <span>Ctrl</span>
    </div>
    <nav aria-label="Authoring mode">
      <button :class="{ selected: selectedView === 'code' }" @click="selectView('code')">Code</button>
      <button :class="{ selected: selectedView === 'blockly' }" @click="selectView('blockly')">Blocks</button>
    </nav>
    <div class="core-state" :class="{ offline: !status.attached }">
      <span class="signal" :class="{ live: status.connected }"></span>
      <span class="core-label">Core</span>
      <strong>{{ status.attached ? (status.connected ? 'Connected' : 'Ready') : 'Unavailable' }}</strong>
      <span v-if="status.attached" class="detail">{{ status.cueCount }} cues / {{ status.mappingCount }} mappings</span>
      <span v-if="status.firmwareUpdateInProgress" class="activity">Updating</span>
      <span v-else-if="status.serial.recoveryPending" class="activity">Recovering</span>
      <span v-else-if="status.serial.yielded" class="activity">Paused</span>
    </div>
  </header>
</template>

<style scoped lang="scss">
.workspace-header { height:48px; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; padding:0 14px; background:linear-gradient(90deg, rgb(var(--color-dark)), rgb(var(--color-bg2))); border-bottom:1px solid rgba(var(--color-neutral), .45); }
.wordmark { display:flex; align-items:baseline; gap:8px; font-size:1rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
.mark { color:rgb(var(--color-primary)); font-family:'Iosevka Makeshift', monospace; }
nav { display:flex; gap:4px; padding:3px; border-radius:9px; background:rgba(var(--color-bg), .7); }
button { min-height:28px; padding:3px 12px; border:0; border-radius:6px; background:transparent; color:rgb(var(--color-neutral)); font-size:.77rem; letter-spacing:.04em; text-transform:uppercase; }
button:hover { background:rgba(var(--color-primary), .18); color:rgb(var(--color-text)); }
button.selected { background:rgb(var(--color-primary)); color:rgb(var(--color-text-primary-contrast)); }
.core-state { justify-self:end; display:flex; align-items:center; gap:7px; font-size:.76rem; }
.signal { width:8px; height:8px; border-radius:50%; background:rgb(var(--color-neutral)); }
.signal.live { background:rgb(var(--color-green)); box-shadow:0 0 10px rgb(var(--color-green)); }
.core-label { color:rgb(var(--color-primary)); font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
.activity { color:rgb(var(--color-primary2)); }
.detail { color:rgb(var(--color-neutral)); }
.offline { color:rgb(var(--color-neutral)); }
@media (max-width:640px) { .workspace-header { grid-template-columns:auto 1fr; } nav { justify-self:end; } .core-state { display:none; } }
</style>
