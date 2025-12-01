import { ElectronAPI } from '@electron-toolkit/preload'
import { Course, CourseSummary } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // 列表返回的是摘要信息数组
      getCourseList: () => Promise<CourseSummary[]>
      // 详情返回的是完整课程对象
      getCourseDetail: (id: string) => Promise<Course | undefined>
    }
  }
}
