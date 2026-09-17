<template>
  <div class="call-history-message" :class="{ 'call-history-message--mine': isMine }">
    <n-icon :size="30" :component="record.type === 'screen' ? ScreenShareFilled : record.type === 'audio' ? PhoneFilled : VideocamFilled" />
    <div class="call-history-message__content">
      <strong>{{ presentation.title }}</strong>
      <span>{{ presentation.detail }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NIcon } from 'naive-ui';
import { PhoneFilled, ScreenShareFilled, VideocamFilled } from '@vicons/material';
import type { CallHistoryRecord } from '@/api/message';
import { getCallHistoryPresentation } from '@/services/callHistory';

const props = defineProps<{
  record: CallHistoryRecord;
  isMine: boolean;
}>();

const presentation = computed(() => getCallHistoryPresentation(props.record, props.isMine));
</script>

<style scoped>
.call-history-message {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 190px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  color: #334155;
  box-shadow: 0 2px 8px rgb(15 23 42 / 8%);
}

.call-history-message--mine {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1e40af;
}

.call-history-message__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.call-history-message__content strong {
  font-size: 14px;
  line-height: 20px;
}

.call-history-message__content span {
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
}
</style>
