import { test, expect, _electron as electron } from '@playwright/test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { startMockLlm } from './fixtures/mock-llm'

test('opens a document and streams an answer', async () => {
  const { server, url } = await startMockLlm()
  const settingsFile = join(process.cwd(), 'e2e', '.tmp-settings.json')
  // 会话按文档路径持久化，必须隔离 userData，否则上一轮的回答会被恢复出来。
  const userDataDir = join(process.cwd(), 'e2e', '.tmp-userdata')
  rmSync(userDataDir, { recursive: true, force: true })

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      REMDA_E2E_DOC: join(process.cwd(), 'e2e', 'fixtures', 'sample.md'),
      REMDA_E2E_SETTINGS: settingsFile,
      REMDA_E2E_BASE_URL: url
    }
  })
  const page = await app.firstWindow()

  await expect(page.getByRole('heading', { name: 'Remda 测试文档' })).toBeVisible()
  await expect(page.locator('.katex').first()).toBeVisible()

  await page.getByPlaceholder(/问点什么/).fill('这段是什么意思？')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.bubble--assistant')).toContainText('这是来自 mock 的回答')

  await app.close()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})
