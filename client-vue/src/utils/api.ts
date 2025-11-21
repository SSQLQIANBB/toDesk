/**
 * API 配置
 * 开发环境使用 Vite 代理，生产环境使用绝对路径
 */
export const API_BASE_URL = import.meta.env.PROD
  ? 'http://localhost:3000/api' 
  : '/api';

/**
 * 聊天相关 API
 */
export const chatApi = {
  /**
   * 发送消息并接收流式响应
   * @param message 用户消息
   * @returns Response 对象，需要自己处理流式数据
   */
  async sendMessage(message: string): Promise<Response> {
    const response = await fetch(`${API_BASE_URL}/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.statusText}`);
    }

    return response;
  },

  /**
   * 测试用的简单流式接口
   * @param message 测试消息
   * @returns EventSource 对象
   */
  streamTest(message: string): EventSource {
    const url = new URL(`${API_BASE_URL}/chat/stream`);
    url.searchParams.append('message', message);
    return new EventSource(url.toString());
  }
};

/**
 * SSE 工具函数
 */
export const sseUtils = {
  /**
   * 读取 SSE 流式响应
   * @param response Fetch Response 对象
   * @param onMessage 接收到消息时的回调
   * @param onError 发生错误时的回调
   */
  async readStream(
    response: Response,
    onMessage: (data: any) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5).trim());
              onMessage(data);
            } catch (err) {
              console.warn('解析 SSE 数据失败:', line);
            }
          }
        }
      }
    } catch (error) {
      if (onError) {
        onError(error as Error);
      } else {
        throw error;
      }
    }
  }
};

