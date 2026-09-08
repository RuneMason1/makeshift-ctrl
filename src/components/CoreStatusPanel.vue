<script setup lang="ts">
import { inject, type Ref } from 'vue'

type CoreStatus = { attached: boolean; connected: boolean; firmwareUpdateInProgress: boolean; reason?: string }
const status = inject('core-status') as Ref<CoreStatus>
</script>

<template>
  <aside class="core-status" :class="{ unavailable: !status.attached }">
    <span class="signal" :class="{ live: status.connected }"></span>
    <span class="label">Core</span>
    <strong>{{ status.attached ? (status.connected ? 'Device connected' : 'Device idle') : 'Unavailable' }}</strong>
    <span v-if="status.firmwareUpdateInProgress" class="activity">Updating firmware</span>
    <span v-else-if="!status.attached && status.reason" class="reason">{{ status.reason }}</span>
  </aside>
</template>

<style scoped lang="scss">
.core-status { position:absolute; z-index:4; top:10px; right:12px; display:flex; align-items:center; gap:8px; padding:7px 10px; border:1px solid rgba(var(--color-primary), .8); border-radius:999px; background:rgba(var(--color-dark), .88); box-shadow:0 8px 24px rgba(0,0,0,.24); font-size:.76rem; }
.signal { width:8px; height:8px; border-radius:50%; background:rgb(var(--color-neutral)); }
.signal.live { background:rgb(var(--color-green)); box-shadow:0 0 10px rgb(var(--color-green)); }
.label { color:rgb(var(--color-primary)); font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
.activity { color:rgb(var(--color-primary2)); }
.reason { color:rgb(var(--color-neutral)); }
.unavailable { border-color:rgba(var(--color-neutral), .65); }
</style>
