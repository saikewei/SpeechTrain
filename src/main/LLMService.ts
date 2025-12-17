import { config } from 'dotenv'
import { net } from 'electron'

config()

interface AudioMessage {
  audio: string // base64 格式的音频数据
}

interface TextMessage {
  text: string
}

type ContentItem = AudioMessage | TextMessage

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: ContentItem[]
}

interface LLMRequest {
  model: string
  input: {
    messages: Message[]
  }
}

interface LLMResponse {
  output: {
    choices: Array<{
      message: {
        role: string
        content: Array<{ text: string }>
      }
    }>
  }
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

class LLMService {
  private apiKey: string
  private baseUrl: string
  private model: string

  constructor() {
    // 从环境变量读取 API 密钥
    this.apiKey = process.env.DASHSCOPE_API_KEY || ''
    this.baseUrl =
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
    this.model = 'qwen-audio-turbo-latest'

    if (!this.apiKey) {
      console.warn(
        '[LLM] Warning: DASHSCOPE_API_KEY is not set. Audio analysis functionality will be disabled.'
      )
    }
  }

  /**
   * 将音频 Buffer 转换为 base64 格式
   * @param audioBuffer 音频数据
   * @returns base64 编码的音频字符串
   */
  private bufferToBase64(audioBuffer: Buffer): string {
    // 明确指定 MIME type 为 audio/wav
    return `data:audio/wav;base64,${audioBuffer.toString('base64')}`
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
    if (!this.apiKey) {
      throw new Error(
        'LLM API key is not configured. Please set the DASHSCOPE_API_KEY environment variable.'
      )
    }

    const base64Audio = this.bufferToBase64(audioBuffer)

    const requestBody: LLMRequest = {
      model: this.model,
      input: {
        messages: [
          {
            role: 'system',
            content: [{ text: '你是一个语言学家。' }]
          },
          {
            role: 'user',
            content: [{ audio: base64Audio }, { text: prompt }]
          }
        ]
      }
    }

    console.log(`[LLM] Analyzing audio with prompt: "${prompt}"`)

    try {
      const result = await new Promise<LLMResponse>((resolve, reject) => {
        const request = net.request({
          method: 'POST',
          url: this.baseUrl
        })

        request.setHeader('Authorization', `Bearer ${this.apiKey}`)
        request.setHeader('Content-Type', 'application/json')

        request.on('response', (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk) => chunks.push(chunk))
          response.on('end', () => {
            const body = Buffer.concat(chunks).toString()
            if (response.statusCode >= 200 && response.statusCode < 300) {
              try {
                resolve(JSON.parse(body))
              } catch (e) {
                reject(new Error('Failed to parse JSON response' + e))
              }
            } else {
              reject(new Error(`API Error (${response.statusCode}): ${body}`))
            }
          })
          response.on('error', (error) => reject(error))
        })

        request.on('error', (error) => reject(error))
        request.write(JSON.stringify(requestBody))
        request.end()
      })

      // 提取返回的文本内容
      const content = result.output?.choices?.[0]?.message?.content?.[0]?.text

      if (!content) {
        throw new Error('Invalid response format from LLM API')
      }

      console.log(
        `[LLM] Analysis complete. Tokens used: ${result.usage?.input_tokens}/${result.usage?.output_tokens}`
      )

      return content
    } catch (error) {
      console.error('[LLM] Failed to analyze audio:', error)
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
