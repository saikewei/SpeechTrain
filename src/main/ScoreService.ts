import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { ScoreRecord } from '../shared/types'

class ScoreService {
  private scores: ScoreRecord[] = []
  private scoresPath: string

  constructor() {
    this.scoresPath = path.join(app.getPath('userData'), 'scores_history.json')
  }

  loadScores(): void {
    if (!fs.existsSync(this.scoresPath)) return

    try {
      const data = fs.readFileSync(this.scoresPath, 'utf-8')
      this.scores = JSON.parse(data)
    } catch (e) {
      console.error('Error loading scores:', e)
    }
  }

  saveScores(): void {
    try {
      fs.writeFileSync(this.scoresPath, JSON.stringify(this.scores, null, 2), 'utf-8')
    } catch (e) {
      console.error('Error saving scores:', e)
    }
  }

  addRecord(record: ScoreRecord): void {
    this.scores.unshift(record) // 新记录放在最前面
    // 最多保留 100 条记录
    if (this.scores.length > 100) {
      this.scores = this.scores.slice(0, 100)
    }
    this.saveScores()
  }

  getAllRecords(): ScoreRecord[] {
    return this.scores
  }

  clearHistory(): void {
    this.scores = []
    this.saveScores()
  }
}

export const scoreService = new ScoreService()
scoreService.loadScores()
