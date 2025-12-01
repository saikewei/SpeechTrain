import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { Course } from '../shared/types'

// 2. 加载课程函数
export function loadCourses(): Course[] {
  const isProd = app.isPackaged
  // 生产环境在 resources/courses，开发环境在项目根目录 resources/courses
  const resourcesPath = isProd
    ? path.join(process.resourcesPath, 'courses')
    : path.join(app.getAppPath(), 'resources', 'courses')

  console.log('Loading courses from:', resourcesPath)

  if (!fs.existsSync(resourcesPath)) {
    console.warn('Courses directory not found!')
    return []
  }

  const files = fs.readdirSync(resourcesPath).filter((file) => file.endsWith('.json'))

  // 使用 flatMap 替代 map
  // flatMap 会自动将回调函数返回的数组“展平”
  const courses = files.flatMap((file) => {
    try {
      const data = fs.readFileSync(path.join(resourcesPath, file), 'utf-8')
      const parsed = JSON.parse(data)

      // 判断解析出来的是数组还是单个对象
      if (Array.isArray(parsed)) {
        // 如果是数组（包含多个课程），直接返回，flatMap 会把它们拆开加入总列表
        return parsed as Course[]
      } else {
        // 如果是单个对象，包装成数组返回
        return [parsed as Course]
      }
    } catch (e) {
      console.error(`Error loading course ${file}:`, e)
      // 出错时返回空数组，flatMap 会忽略它，不会产生 null
      return []
    }
  })

  return courses
}
