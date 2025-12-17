import { config } from 'dotenv'

config()

// TTS 语音配置映射
interface VoiceConfig {
  lang: string // SSML 语言代码
  voice: string // 语音名称
  gender: 'Male' | 'Female'
}

const VOICE_MAP: Record<string, VoiceConfig> = {
  英语: {
    lang: 'en-US',
    voice: 'en-US-JennyNeural',
    gender: 'Female'
  },
  中文: {
    lang: 'zh-CN',
    voice: 'zh-CN-XiaoxiaoNeural',
    gender: 'Female'
  },
  日语: {
    lang: 'ja-JP',
    voice: 'ja-JP-NanamiNeural',
    gender: 'Female'
  },
  法语: {
    lang: 'fr-FR',
    voice: 'fr-FR-DeniseNeural',
    gender: 'Female'
  },
  德语: {
    lang: 'de-DE',
    voice: 'de-DE-KatjaNeural',
    gender: 'Female'
  },
  西班牙语: {
    lang: 'es-ES',
    voice: 'es-ES-ElviraNeural',
    gender: 'Female'
  },
  // 按照语言代码索引（用于 API 调用）
  en: {
    lang: 'en-US',
    voice: 'en-US-JennyNeural',
    gender: 'Female'
  },
  zh: {
    lang: 'zh-CN',
    voice: 'zh-CN-XiaoxiaoNeural',
    gender: 'Female'
  },
  ja: {
    lang: 'ja-JP',
    voice: 'ja-JP-NanamiNeural',
    gender: 'Female'
  },
  fr: {
    lang: 'fr-FR',
    voice: 'fr-FR-DeniseNeural',
    gender: 'Female'
  },
  de: {
    lang: 'de-DE',
    voice: 'de-DE-KatjaNeural',
    gender: 'Female'
  },
  es: {
    lang: 'es-ES',
    voice: 'es-ES-ElviraNeural',
    gender: 'Female'
  }
}

class TTSService {
  private apiKey: string
  private region: string
  private baseUrl: string

  constructor() {
    // 从环境变量读取 API 密钥
    this.apiKey = process.env.AZURE_TTS_API_KEY || ''
    this.region = process.env.AZURE_TTS_REGION || 'eastasia'
    this.baseUrl = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`

    if (!this.apiKey) {
      console.warn(
        '[TTS] Warning: AZURE_TTS_API_KEY is not set. TTS functionality will be disabled.'
      )
    }
  }

  /**
   * 获取语音配置
   * @param langCode 语言代码（如 'en', 'zh', '英语', '中文'）
   */
  private getVoiceConfig(langCode: string): VoiceConfig {
    const config = VOICE_MAP[langCode]
    if (!config) {
      console.warn(
        `[TTS] Warning: Language "${langCode}" not found. Using default English configuration.`
      )
      return VOICE_MAP['en']
    }
    return config
  }

  /**
   * 构建 SSML 文本
   * @param text 要合成的文本
   * @param langCode 语言代码
   */
  private buildSSML(text: string, langCode: string): string {
    const config = this.getVoiceConfig(langCode)

    // 转义 XML 特殊字符
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

    return `
      <speak version='1.0' xml:lang='${config.lang}'>
        <voice xml:lang='${config.lang}' xml:gender='${config.gender}' name='${config.voice}'>
          ${escapedText}
        </voice>
      </speak>
    `.trim()
  }

  /**
   * 合成语音
   * @param text 要合成的文本
   * @param langCode 语言代码
   * @returns 音频数据 (PCM Buffer)
   */
  async synthesize(text: string, langCode: string): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error(
        'TTS API key is not configured. Please set the AZURE_TTS_API_KEY environment variable.'
      )
    }

    const ssml = this.buildSSML(text, langCode)
    const config = this.getVoiceConfig(langCode)

    console.log(`[TTS] Synthesizing: "${text}" (${config.voice})`)

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'riff-16khz-16bit-mono-pcm',
          'User-Agent': 'SpeechTrainApp/1.0'
        },
        body: ssml
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`TTS API error (${response.status}): ${errorText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch (error) {
      console.error('[TTS] failed to synthesize:', error)
      throw error
    }
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages(): Array<{ code: string; name: string; voice: string }> {
    return [
      { code: 'en', name: '英语', voice: VOICE_MAP['英语'].voice },
      { code: 'zh', name: '中文', voice: VOICE_MAP['中文'].voice },
      { code: 'ja', name: '日语', voice: VOICE_MAP['日语'].voice },
      { code: 'fr', name: '法语', voice: VOICE_MAP['法语'].voice },
      { code: 'de', name: '德语', voice: VOICE_MAP['德语'].voice },
      { code: 'es', name: '西班牙语', voice: VOICE_MAP['西班牙语'].voice }
    ]
  }

  /**
   * 检查 API 密钥是否已配置
   */
  isConfigured(): boolean {
    return !!this.apiKey
  }
}

// 导出单例
export const ttsService = new TTSService()
