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

test('renders latex delimiters emitted by the model', async () => {
  const { server, url } = await startMockLlm(0, {
    chunks: ['行内 \\(a^2+b^2\\) 与独立公式\n\n\\[\n\\frac{1}{2}\n\\]\n']
  })
  const settingsFile = join(process.cwd(), 'e2e', '.tmp-settings.json')
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
  await page.getByPlaceholder(/问点什么/).fill('给我一个公式')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.bubble--assistant .katex').first()).toBeVisible()
  await expect(page.locator('.bubble--assistant .katex-display')).toBeVisible()

  await app.close()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})

test('retrieves related files from the opened folder', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'remda-workspace-'))
  await mkdir(join(dir, 'ch01'), { recursive: true })
  await writeFile(join(dir, 'README.md'), '# 目录\n\nSylow 定理在 1.10。\n', 'utf8')
  const current = join(dir, 'ch01', '1.1-群.md')
  await writeFile(current, '# 群\n\n当前文档内容。\n', 'utf8')
  await writeFile(
    join(dir, 'ch01', '1.10-Sylow定理.md'),
    '# Sylow 定理\n\nSylow 第一定理的独特内容。\n',
    'utf8'
  )

  const { server, url, requests } = await startMockLlm()
  const settingsFile = join(process.cwd(), 'e2e', '.tmp-settings.json')
  const userDataDir = join(process.cwd(), 'e2e', '.tmp-userdata')
  rmSync(userDataDir, { recursive: true, force: true })

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      REMDA_E2E_DOC: current,
      REMDA_E2E_FOLDER: dir,
      REMDA_E2E_SETTINGS: settingsFile,
      REMDA_E2E_BASE_URL: url,
      REMDA_E2E_RETRIEVAL: 'local'
    }
  })
  const page = await app.firstWindow()

  await expect(page.getByRole('heading', { name: '群' })).toBeVisible()
  await page.getByPlaceholder(/问点什么/).fill('Sylow 第一定理的独特内容怎么证明')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.bubble--assistant')).toContainText('这是来自 mock 的回答')

  await expect(page.getByText(/参考 \d+ 个文件/)).toBeVisible()
  const payload = JSON.stringify(requests[0])
  expect(payload).toContain('1.10-Sylow定理.md')
  expect(payload).toContain('Sylow 第一定理的独特内容')

  await app.close()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  await rm(dir, { recursive: true, force: true })
})

test('shows thinking state without leaking reasoning text', async () => {
  const { server, url, requests } = await startMockLlm(0, {
    reasoningChunks: ['内部思考内容', '继续思考', '再思考一步', '准备作答'],
    chunks: ['这是来自 mock 的回答'],
    intervalMs: 120
  })
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
      REMDA_E2E_THINKING: 'deep'
    }
  })
  const page = await app.firstWindow()

  await expect(page.getByRole('heading', { name: 'Remda 测试文档' })).toBeVisible()
  await page.getByPlaceholder(/问点什么/).fill('请认真回答')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('正在思考…')).toBeVisible()
  await expect(page.locator('.bubble--assistant')).toContainText('这是来自 mock 的回答')
  await expect(page.locator('.bubble--assistant')).not.toContainText('内部思考内容')
  expect(JSON.stringify(requests[0])).toContain('"reasoning_effort":"high"')

  await app.close()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})

test('lets the model choose related files before answering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'remda-ai-workspace-'))
  await mkdir(join(dir, 'ch01'), { recursive: true })
  const current = join(dir, 'ch01', '1.1-群.md')
  await writeFile(current, '# 群\n\n当前文档内容。\n', 'utf8')
  await writeFile(
    join(dir, 'ch01', '1.10-Sylow定理.md'),
    '# Sylow 定理\n\nSylow 第一定理的独特内容。\n',
    'utf8'
  )
  await writeFile(join(dir, 'ch02.md'), '# 环\n\n无关内容。\n', 'utf8')

  const { server, url, requests } = await startMockLlm(0, {
    plannerResponse: {
      files: [{ path: 'ch01/1.10-Sylow定理.md', heading: 'Sylow 定理' }],
      keywords: ['Sylow']
    }
  })
  const settingsFile = join(process.cwd(), 'e2e', '.tmp-settings.json')
  const userDataDir = join(process.cwd(), 'e2e', '.tmp-userdata')
  rmSync(userDataDir, { recursive: true, force: true })

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      REMDA_E2E_DOC: current,
      REMDA_E2E_FOLDER: dir,
      REMDA_E2E_SETTINGS: settingsFile,
      REMDA_E2E_BASE_URL: url,
      REMDA_E2E_RETRIEVAL: 'ai'
    }
  })
  const page = await app.firstWindow()

  await expect(page.getByRole('heading', { name: '群' })).toBeVisible()
  await page.getByPlaceholder(/问点什么/).fill('Sylow 第一定理怎么证明')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.bubble--assistant')).toContainText('这是来自 mock 的回答')
  await expect(page.getByText(/参考 \d+ 个文件/)).toBeVisible()

  expect(requests).toHaveLength(2)
  const planner = JSON.stringify(requests[0])
  expect(planner).toContain('检索规划器')
  expect(planner).toContain('1.10-Sylow定理.md')
  const answer = JSON.stringify(requests[1])
  expect(answer).toContain('Sylow 第一定理的独特内容')

  await app.close()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  await rm(dir, { recursive: true, force: true })
})

test('streams an answer over the Anthropic protocol', async () => {  const { server, url } = await startMockLlm()
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

test('keeps streaming output pinned and pauses when scrolled up', async () => {
  const answer = Array.from(
    { length: 60 },
    (_, i) => `第 ${i + 1} 段：这是一段用来撑开滚动区域的长文本，流式输出时应当始终贴住底部。\n\n`
  ).join('')
  const chunks = answer.match(/[\s\S]{1,24}/g) ?? [answer]
  const { server, url } = await startMockLlm(0, { chunks, intervalMs: 25 })
  const settingsFile = join(process.cwd(), 'e2e', '.tmp-settings.json')
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
  await page.getByPlaceholder(/问点什么/).fill('给我一段长回答')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.bubble--assistant')).toContainText('第 1 段')

  const scroll = page.locator('.chat__scroll')
  const distance = (): Promise<number> =>
    scroll.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)
  const jump = page.getByRole('button', { name: '回到底部' })

  // 流式过程中持续采样：跟随不能中断（不能出现回到底部按钮），
  // 距离也不能持续累积。采样可能落在 DOM 长高、ResizeObserver 尚未补滚的
  // 同一帧间隙里，所以允许几行以内的瞬时值，但绝不允许像取消跟随那样越滚越远。
  const samples: number[] = []
  let jumpSeen = false
  for (let i = 0; i < 10; i += 1) {
    samples.push(await distance())
    jumpSeen = jumpSeen || (await jump.isVisible())
    await page.waitForTimeout(60)
  }
  expect(jumpSeen).toBe(false)
  expect(Math.max(...samples)).toBeLessThanOrEqual(100)

  // 上滚后暂停跟随，并出现回到底部按钮。
  await scroll.evaluate((el) => {
    el.scrollTop = 0
    el.dispatchEvent(new Event('scroll'))
  })
  await page.waitForTimeout(300)
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(0)
  await expect(jump).toBeVisible()
  await expect(page.getByRole('button', { name: '停止' })).toBeVisible()

  await jump.click()
  await expect(page.getByRole('button', { name: '停止' })).toHaveCount(0)
  await expect.poll(distance).toBeLessThanOrEqual(2)
  await expect(jump).toHaveCount(0)

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

test('leaves fullscreen with escape', async () => {
  const settingsFile = join(process.cwd(), 'e2e', '.tmp-settings.json')
  const userDataDir = join(process.cwd(), 'e2e', '.tmp-userdata')
  rmSync(userDataDir, { recursive: true, force: true })

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      REMDA_E2E_DOC: join(process.cwd(), 'e2e', 'fixtures', 'sample.md'),
      REMDA_E2E_SETTINGS: settingsFile,
      REMDA_E2E_BASE_URL: 'http://127.0.0.1:9/v1'
    }
  })
  const page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: 'Remda 测试文档' })).toBeVisible()

  const isFullScreen = (): Promise<boolean> =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? false)

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setFullScreen(true)
  })
  await expect.poll(isFullScreen).toBe(true)

  // page.keyboard 走 CDP，不会触发 before-input-event；用主进程输入事件模拟真实按键。
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'Escape'
    })
  })
  await expect.poll(isFullScreen).toBe(false)

  await app.close()
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
