import { publicEnv } from '@/config/env';

export function resolveChatMediaUrl(url: string) {
  if (/^https:\/\//i.test(url)) return url;
  return `${publicEnv.apiBaseUrl}${url}`;
}

export function selectAudioMimeType() {
  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ].find(type => MediaRecorder.isTypeSupported(type)) || '';
}

export function getAudioFileExtension(mimeType: string) {
  return mimeType.includes('ogg') ? 'ogg' : 'webm';
}
