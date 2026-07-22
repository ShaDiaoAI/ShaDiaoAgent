/**
 * 该模块实现已迁移至 @shadiao/session-core（headless 核心，纯函数）。
 * 保留此文件为 re-export shim，使既有 `from './thinking-tag-parser'` 导入方零改动。
 */
export {
  normalizeThinkTagsInContentBlocks,
  parseThinkTagsFromText,
  splitThinkTagsInTextBlock,
} from '@shadiao/session-core'
