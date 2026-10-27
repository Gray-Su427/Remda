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

const createProcessor = (options: ImageOptions) =>
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

export async function renderMarkdown(md: string, options: ImageOptions = {}): Promise<string> {
  return String(await createProcessor(options).process(stripFrontmatter(md)))
}
