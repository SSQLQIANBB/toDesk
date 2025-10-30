<script setup lang="ts">
import { type Socket, io } from 'socket.io-client';

let socket: Socket | null;
function handleConnect() {
  socket = io('localhost:3000', {
    path: '/connect'
  })

  socket.on('connect', () => {
    console.log('socket connecting....')
  })
}

function handleDisconnect() {
  socket?.disconnect();
}

let sse: EventSource | null
// sse
function connectSSE() {
  sse = new EventSource('/api/sse/connect')

  sse.onmessage = e => {
    console.log('sse-message', e);
  }
}

function closeSSE() {
  sse?.close();
}
</script>

<template>
  <n-button type="primary" @click="handleConnect">connect</n-button>
  <n-button type="primary" @click="handleDisconnect">disconnect</n-button>

  <n-button type="info" @click="connectSSE">Connect-SSE</n-button>
  <n-button type="info" @click="closeSSE">Close-SSE</n-button>
</template>
