import { describe, expect, test } from 'bun:test'
import { applyAgentSdkAuthEnv, usesAgentSdkBearerWithUserAgent } from './agent-sdk-auth-env'

describe('Agent SDK 认证环境变量', () => {
  test.each(['kimi-coding', 'zhipu-coding', 'zhipu-coding-team', 'xiaomi-token-plan'] as const)(
    'Given %s When 写入 SDK 认证 env Then 使用 Bearer 与 Proma User-Agent',
    (provider) => {
      const env: Record<string, string | undefined> = {}

      applyAgentSdkAuthEnv(env, provider, 'test-key', 'ShaDiaoAgent/test')

      expect(usesAgentSdkBearerWithUserAgent(provider)).toBe(true)
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('test-key')
      expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe('User-Agent: ShaDiaoAgent/test')
      expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    },
  )

  test('Given 智谱团队版 JSON 凭证 When 写入 SDK 认证 env Then 只使用 apiKey 调模型', () => {
    const env: Record<string, string | undefined> = {}

    applyAgentSdkAuthEnv(
      env,
      'zhipu-coding-team',
      '{"apiKey":"model-key","organization":"org","project":"proj"}',
      'ShaDiaoAgent/test',
    )

    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('model-key')
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe('User-Agent: ShaDiaoAgent/test')
  })

  test('Given 普通 Anthropic 渠道 When 写入 SDK 认证 env Then 使用 API Key', () => {
    const env: Record<string, string | undefined> = {}

    applyAgentSdkAuthEnv(env, 'anthropic', 'test-key', 'ShaDiaoAgent/test')

    expect(env.ANTHROPIC_API_KEY).toBe('test-key')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBeUndefined()
  })
})
