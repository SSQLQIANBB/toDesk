import { request } from '@/utils/request';

// router.post('/upload', authMiddleware, fileController.uploadFile);
// router.get('/', authMiddleware, fileController.getFiles);
// router.get('/:fileId/download', authMiddleware, fileController.downloadFile);
// router.delete('/:fileId', authMiddleware, fileController.deleteFile);

interface FileInfo {
  id: string;
  originalName: string;
  fileSize: Number;
  mimeType: string;
  fileUrl: string;
  createdAt: string;
}
/**
 * 上传文件
 */
export function uploadFile(files: FormData) {
  return request<{ message: string; file: FileInfo }>('/api/files/upload', {
    method: 'POST',
    body: files,
  });
}
