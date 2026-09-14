const SHADIAO_REPO_URL = 'https://github.com/ShaDiaoAI/ShaDiaoAgent'

let _shadiaoVersion = '0.0.0'

export function setPromaVersion(version: string): void {
  _shadiaoVersion = version
}

export function getPromaVersion(): string {
  return _shadiaoVersion
}

export function getPromaUserAgent(version?: string): string {
  const v = version ?? _shadiaoVersion
  return `ShaDiaoAgent/${v} (+${SHADIAO_REPO_URL})`
}
