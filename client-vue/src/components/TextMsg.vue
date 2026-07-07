<template>
  <div class="h-full w-full border relative rounded-md overflow-hidden">
    <!-- 可编辑输入框 -->
    <div
      ref="editorRef"
      class="w-full h-full p-2 outline-none overflow-auto whitespace-pre-wrap break-words"
      :contenteditable="true"
      @input="onInput"
      @keydown="onKeydown"
      @paste="onPaste"
    ></div>

    <!-- 占位提示 -->
    <span
      v-if="!inputValue"
      class="text-gray-400 absolute left-2 top-2 pointer-events-none select-none"
    >
      {{ placeholder }}
    </span>

    <!-- 发送按钮 -->
    <n-button
      class="absolute bottom-2 right-2"
      :disabled="!inputValue"
      size="large"
      type="primary"
      @click="handleSend"
    >
      发送
    </n-button>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, computed, onMounted } from 'vue'

type MsgValue = string

const props = withDefaults(
  defineProps<{
    value?: MsgValue
    placeholder?: string
  }>(),
  {
    placeholder: '请输入...',
  }
)

const emits = defineEmits<{
  (e: 'update:value', value: MsgValue): void
  (e: 'send', value: MsgValue): void
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const defaultValue = ref(props.value || '')

const inputValue = computed({
  get: () => defaultValue.value,
  set: (v) => {
    defaultValue.value = v
    emits('update:value', v)
  }
})

// 同步外部 v-model
watch(
  () => props.value,
  (v) => {
    if (v !== defaultValue.value) {
      defaultValue.value = v || ''
      if (editorRef.value && editorRef.value.innerText !== v) {
        editorRef.value.innerText = v || ''
      }
    }
  },
  { immediate: true }
)

// 输入事件
function onInput() {
  inputValue.value = editorRef.value?.innerText || ''
}

// 粘贴时过滤富文本样式
function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain')
  if (text) document.execCommand('insertText', false, text)
}

// 键盘事件：Enter 发送，Shift+Enter 换行
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      // Shift + Enter → 换行
      e.preventDefault()
      insertNewLine()
    } else {
      // Enter → 发送
      e.preventDefault()
      handleSend()
    }
  }
}

// 插入换行符（保持 contenteditable 结构）
function insertNewLine() {
  const selection = window.getSelection()

  if (!selection || !selection.rangeCount) return
  const range = selection.getRangeAt(0)

  const br = document.createElement('br')
  range.deleteContents()
  range.insertNode(br)
  range.setStartAfter(br)
  range.setEndAfter(br)
  selection.removeAllRanges()
  selection.addRange(range)
}

// 发送事件
function handleSend() {
  console.log(inputValue.value)
  const text = inputValue.value.trim()
  if (!text) return
  emits('send', text)
  // 清空
  inputValue.value = ''
  if (editorRef.value) editorRef.value.innerText = ''
}

onMounted(() => {
  if (props.value && editorRef.value) {
    editorRef.value.innerText = props.value
  }
})
</script>

<style scoped>
div[contenteditable="true"] {
  min-height: 100px;
  /* max-height: 240px; */
  overflow-y: auto;
}
</style>
