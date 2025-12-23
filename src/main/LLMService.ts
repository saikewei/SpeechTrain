import { config } from 'dotenv'
import WebSocket from 'ws'
import ffmpeg from 'fluent-ffmpeg'
import { Readable } from 'stream'

config()

class LLMService {
  private apiKey: string
  private baseUrl: string

  constructor() {
    // 从环境变量读取 API 密钥
    this.apiKey = process.env.DASHSCOPE_API_KEY || ''
    this.baseUrl = 'wss://sg.uiuiapi.com/v1/realtime?model=gpt-4o-realtime-preview'

    if (!this.apiKey) {
      console.warn(
        '[LLM] Warning: DASHSCOPE_API_KEY is not set. Audio analysis functionality will be disabled.'
      )
    }
  }

  /**
   * 处理音频文件，转换为 PCM 16-bit, 24kHz, 单声道格式
   */
  private async processAudioBuffer(audioBuffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const bufferStream = new Readable()
      bufferStream.push(audioBuffer)
      bufferStream.push(null)

      const chunks: Buffer[] = []

      ffmpeg(bufferStream)
        .audioFrequency(24000)
        .audioChannels(1)
        .audioCodec('pcm_s16le')
        .format('s16le')
        .on('error', (err) => {
          console.error('[LLM] Audio processing error:', err)
          reject(err)
        })
        .on('end', () => {
          const rawData = Buffer.concat(chunks)
          const base64Audio = rawData.toString('base64')
          resolve(base64Audio)
        })
        .pipe()
        .on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })
    })
  }

  /**
   * 分析音频内容
   * @param audioBuffer 音频数据 (Buffer)
   * @param prompt 分析提示词 (可选)
   * @returns AI 分析结果文本
   */
  async analyzeAudio(
    audioBuffer: Buffer,
    prompt: string = '请评价这段音频的发音质量。'
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('API Key is not configured')
    }

    try {
      // 1. 处理音频
      console.log('[LLM] Processing audio...')
      const base64Audio = await this.processAudioBuffer(audioBuffer)
      console.log('[LLM] Audio processed, length:', base64Audio.length)

      // 2. 建立 WebSocket 连接
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(this.baseUrl, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        })

        let responseText = ''
        let isProcessing = false

        ws.on('open', () => {
          console.log('[LLM] WebSocket connected')

          // 发送 session.update
          ws.send(
            JSON.stringify({
              type: 'session.update',
              session: {
                modalities: ['text'],
                instructions: `
你是一位专业的口语纠正教练。
你的任务是仅基于教育目的分析用户的音频输入。
请严格专注于分析语音（phonetics）、咬字（articulation）、语调（intonation）和重音。
**绝对不要**分析用户的声纹特征、性别、情绪状态或个人身份信息。

输出要求：
1. 必须使用中文进行回复。
2. 明确指出发音不标准的地方。
3. 使用音标（IPA）辅助解释。
4. 给出具体的改进建议。
                `.trim()
              }
            })
          )

          // 发送 conversation.item.create
          ws.send(
            JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: prompt
                  },
                  {
                    type: 'input_audio',
                    audio: base64Audio
                  }
                ]
              }
            })
          )

          console.log('[LLM] Sent prompt and audio data')

          // 触发回复生成
          ws.send(JSON.stringify({ type: 'response.create' }))
          console.log('[LLM] Waiting for response...')
          isProcessing = true
        })

        ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString())
            const eventType = message.type

            // 错误处理
            if (eventType === 'error') {
              console.error('[LLM] Server error:', message.error.message)
              ws.close()
              reject(new Error(message.error.message))
              return
            }

            // 实时接收文本增量
            if (eventType === 'response.text.delta') {
              responseText += message.delta
            }

            // 响应结束
            if (eventType === 'response.done') {
              console.log('[LLM] Response completed')
              ws.close()
              resolve(responseText || '未能获取到分析结果')
            }
          } catch (err) {
            console.error('[LLM] Message parsing error:', err)
          }
        })

        ws.on('error', (error) => {
          console.error('[LLM] WebSocket error:', error)
          if (isProcessing) {
            reject(error)
          }
        })

        ws.on('close', () => {
          console.log('[LLM] WebSocket closed')
          if (isProcessing && !responseText) {
            reject(new Error('Connection closed without response'))
          }
        })

        // 设置超时
        setTimeout(() => {
          if (isProcessing && !responseText) {
            ws.close()
            reject(new Error('Request timeout'))
          }
        }, 60000) // 60秒超时
      })
    } catch (error) {
      console.error('[LLM] Analysis error:', error)
      throw error
    }
  }

  /**
   * 检查 API 密钥是否已配置
   */
  isConfigured(): boolean {
    return !!this.apiKey
  }
}

// 导出单例
export const llmService = new LLMService()
