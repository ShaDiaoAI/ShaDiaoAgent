/**
 * officeparser 类型声明
 *
 * officeparser 不提供内置 TypeScript 类型，
 * 此声明覆盖项目中使用到的 API。
 */
declare module 'officeparser' {
  /**
   * 异步解析 Office 文档并提取纯文本
   *
   * 支持格式：DOCX, XLSX, PPTX, ODT, ODP, ODS
   *
   * @param filePath 文件的完整路径
   * @returns 提取的纯文本内容
   */
  export function parseOfficeAsync(filePath: string): Promise<string>
}
