import { test, expect, _electron as electron } from '@playwright/test'
import { rmSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PIXEL_PNG, startMockLlm } from './fixtures/mock-llm'

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

test('streams an answer over the Anthropic protocol', async () => {
  const { server, url } = await startMockLlm()
  const settingsFile = join(process.cwd(), 'e2e', '.tmp-settings.json')
  const userDataDir = join(process.cwd(), 'e2e', '.tmp-userdata')
  rmSync(userDataDir, { recursive: true, force: true })

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      REMDA_E2E_DOC: join(process.cwd(), 'e2e', 'fixtures', 'sample.md'),
      REMDA_E2E_SETTINGS: settingsFile,
      REMDA_E2E_BASE_URL: url,
      REMDA_E2E_PROTOCOL: 'anthropic'
    }
  })
  const page = await app.firstWindow()

  await expect(page.getByRole('heading', { name: 'Remda 测试文档' })).toBeVisible()
  await page.getByPlaceholder(/问点什么/).fill('用原生协议回答')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.bubble--assistant')).toContainText('这是来自 mock 的回答')

  await app.close()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})

test('renders http and local relative images', async () => {
  const { server, url } = await startMockLlm()
  const origin = new URL(url).origin
  const docDir = await mkdtemp(join(tmpdir(), 'remda-images-'))
  await mkdir(join(docDir, 'images'), { recursive: true })
  await writeFile(join(docDir, 'images', 'local.png'), PIXEL_PNG)
  const docPath = join(docDir, 'doc.md')
  await writeFile(
    docPath,
    `# 图片测试\n\n![网络](${origin}/pixel.png)\n\n![本地](./images/local.png)\n`
  )

  const settingsFile = join(process.cwd(), 'e2e', '.tmp-settings.json')
  const userDataDir = join(process.cwd(), 'e2e', '.tmp-userdata')
  rmSync(userDataDir, { recursive: true, force: true })

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      REMDA_E2E_DOC: docPath,
      REMDA_E2E_SETTINGS: settingsFile,
      REMDA_E2E_BASE_URL: url
    }
  })
  const page = await app.firstWindow()

  await expect(page.getByRole('heading', { name: '图片测试' })).toBeVisible()
  await expect
    .poll(async () =>
      page
        .locator('.markdown img')
        .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).naturalWidth))
    )
    .toEqual([1, 1])
  await expect(page.locator('.image-failed')).toHaveCount(0)

  await app.close()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  await rm(docDir, { recursive: true, force: true })
})

test('shows a readable chinese message when the document is missing', async () => {
  const settingsFile = join(process.cwd(), 'e2e', '.tmp-settings.json')
  const userDataDir = join(process.cwd(), 'e2e', '.tmp-userdata')
  rmSync(userDataDir, { recursive: true, force: true })

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      REMDA_E2E_DOC: join(process.cwd(), 'e2e', 'fixtures', 'missing.md'),
      REMDA_E2E_SETTINGS: settingsFile,
      REMDA_E2E_BASE_URL: 'http://127.0.0.1:9/v1'
    }
  })
  const page = await app.firstWindow()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('文件不存在')
  await expect(alert).not.toContainText('[object Object]')
  await expect(alert).not.toContainText('Error invoking remote method')

  await app.close()
})
