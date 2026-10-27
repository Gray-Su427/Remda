import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { stripFrontmatter } from '@shared/markdown/frontmatter'
import { rehypeImages, type ImageOptions } from './images'

const buildProcessor = (options: ImageOptions) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkBreaks)
    .use(remarkRehype)
    .use(rehypeImages(options))
    .use(rehypeKatex)
    .use(rehypeSlug)
    .use(rehypeHighlight, { detect: false, ignoreMissing: true })
    .use(rehypeStringify)

type MarkdownProcessor = ReturnType<typeof buildProcessor>

/** 文档目录变化很少；缓存最近几个处理器，避免流式回答时反复构建管线。 */
const processors = new Map<string, MarkdownProcessor>()

const processorFor = (options: ImageOptions): MarkdownProcessor => {
  const key = `${options.baseDir ?? ''}\u0000${options.rootDir ?? ''}`
  const cached = processors.get(key)
  if (cached) return cached

  const processor = buildProcessor(options)
  processors.set(key, processor)
  if (processors.size > 8) {
    const oldest = processors.keys().next().value
    if (oldest !== undefined) processors.delete(oldest)
  }
  return processor
}

export async function renderMarkdown(md: string, options: ImageOptions = {}): Promise<string> {
  return String(await processorFor(options).process(stripFrontmatter(md)))
}
