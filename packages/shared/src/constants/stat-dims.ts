/**
 * PvE（历练）五维属性常量表
 *
 * 前端固化一份 STAT_DIMS，供 mini 属性条 / 加点 Dialog / 战斗 snapshot 三处统一遍历，
 * 保证顺序与后端 `STAT_DIMS = ("wen_zhi","wu_gong","ti_po","mei_li","qi_yun")` 一致。
 *
 * 后端返回的 allocated_stats / effective_stats / skin_base_stats 是 dict（key=snake_case），
 * 前端不假定字段存在（缺省按 0），用本表兜底遍历。
 */

export interface StatDim {
  /** snake_case key，与后端 STAT_DIMS 一致 */
  key: string
  /** 全称：文治/武功/体魄/魅力/气运 */
  label: string
  /** 简称：文/武/体/魅/运 */
  short: string
  /** 一句话说明（加点 Dialog legend） */
  desc: string
}

export const STAT_DIMS: readonly StatDim[] = [
  { key: 'wen_zhi', label: '文治', short: '文', desc: '技能字数上限' },
  { key: 'wu_gong', label: '武功', short: '武', desc: '攻击加成' },
  { key: 'ti_po', label: '体魄', short: '体', desc: '血量' },
  { key: 'mei_li', label: '魅力', short: '魅', desc: '控制技能' },
  { key: 'qi_yun', label: '气运', short: '运', desc: '暴击概率' },
]

export type StatKey = (typeof STAT_DIMS)[number]['key']

/** 五维属性映射（key=snake_case → 数值） */
export type StatMap = Record<StatKey, number>

/** 从任意 dict 读取某维数值，缺省按 0（后端字段可能缺省） */
export function getStat(record: Record<string, number> | null | undefined, key: string): number {
  if (!record) return 0
  const v = record[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
