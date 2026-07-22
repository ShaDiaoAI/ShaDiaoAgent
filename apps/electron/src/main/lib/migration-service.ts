// Stub: Migration service removed in ShaDiaoAgent fork
export async function importBackup(_filePath: string): Promise<{ success: boolean }> {
  return { success: false }
}
export async function exportBackup(): Promise<string | null> {
  return null
}
