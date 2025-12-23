import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { SettingsData } from '../shared/types'

class Settings {
  private settings: SettingsData = {
    AZURE_TTS_KEY: '',
    AZURE_TTS_REGION: 'eastasia',
    DASHSCOPE_API_KEY: ''
  }
  private settingsPath: string

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json')
  }

  loadSettings(): void {
    if (!fs.existsSync(this.settingsPath)) {
      console.warn('Settings file not found, using default settings.')
      return
    }

    try {
      const data = fs.readFileSync(this.settingsPath, 'utf-8')
      this.settings = JSON.parse(data) as SettingsData
    } catch (e) {
      console.error('Error loading settings:', e)
    }
  }

  saveSettings(): void {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (e) {
      console.error('Error saving settings:', e)
    }
  }

  getSettings(): SettingsData {
    return this.settings
  }

  updateSettings(newSettings: Partial<SettingsData>): void {
    this.settings = { ...this.settings, ...newSettings }
    this.saveSettings()
  }
}

export const settings = new Settings()
settings.loadSettings()
