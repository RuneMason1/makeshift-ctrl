<script setup lang="ts" >
import { MakeShiftDeviceEvents } from '@eos-makeshift/serial';
import { computed, inject, Ref } from 'vue';
import { CueId } from '../../types/electron/main/cues';

const events = inject('makeshift-device-events') as MakeShiftDeviceEvents
const eventsList = inject('makeshift-events-flat') as string[]
const selectedEvent = inject('selected-event') as Ref<string>
const selectedEventCue = inject('selected-event-cues') as Ref<CueId | undefined>
const assignedCueLabel = computed(() => selectedEventCue.value ?? 'No cue assigned')

</script>

<template>
  <div :class="['box-border', 'flex', 'flex-col', 'overflow-hidden']">
    <div :class="[
      'box-border',
      'border-solid',
      'border-2',
      'rounded-lg',
      'border-hl',
      'overflow-hidden',
      'device-panel']">
      <select
       name="event-selector"
       v-model="selectedEvent"
      >
        <option v-for="event in eventsList" :key="event" :value="event">
          {{ event }}
        </option>
      </select>
      <div class="assignment-status" :class="{ assigned: selectedEventCue !== undefined }">
        <span class="assignment-label">Assigned cue</span>
        <strong>{{ assignedCueLabel }}</strong>
      </div>

    </div>
  </div>
</template>

<style>
.device-panel {
  background-color: rgb(var(--color-hl));
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
}

.assignment-status {
  align-items: flex-start;
  background: rgb(var(--color-dark));
  border-left: 4px solid rgb(var(--color-neutral));
  border-radius: 0.25rem;
  color: rgb(var(--color-text));
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.assignment-status.assigned {
  border-left-color: rgb(var(--color-green));
}

.assignment-label {
  color: rgb(var(--color-neutral));
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>
