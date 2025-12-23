export interface CourseContent {
  text: string
  translation?: string
}

export interface Course {
  id: string
  title: string
  lang: string
  level: string
  icon: string
  description?: string
  content: CourseContent[]
}

// 列表页返回的简化版课程信息（不含 content）
export interface CourseSummary extends Omit<Course, 'content'> {
  count: number
}

export interface AnalysisResult {
  overall_score: number
  words: Array<{
    word: string
    score: number
    phonemes: Array<{ ipa: string; score: number; is_good: boolean }>
  }>
}

export interface SettingsData {
  AZURE_TTS_KEY: string
  AZURE_TTS_REGION: string
  DASHSCOPE_API_KEY: string
}

export interface ScoreRecord {
  courseId: string
  courseTitle: string
  averageScore: number
  timestamp: number
  details: Array<{
    text: string
    score: number
  }>
}
