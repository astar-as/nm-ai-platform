import fs from "fs"
import path from "path"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeSlug from "rehype-slug"
import rehypePrettyCode from "rehype-pretty-code"
import rehypeSanitize from "rehype-sanitize"
import rehypeStringify from "rehype-stringify"
import { docsNav, type DocNavSection } from "@/lib/docs-nav"

const CONTENT_DIR = path.join(process.cwd(), "content", "docs")

export function getDocContent(slug: string): string {
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(slug)) throw new Error("Invalid slug")
  return fs.readFileSync(path.join(CONTENT_DIR, `${slug}.md`), "utf-8")
}

export interface TocItem {
  id: string
  title: string
  level: number
}

export function extractToc(markdown: string): TocItem[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm
  const items: TocItem[] = []
  let match
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length
    const title = match[2].replace(/`([^`]+)`/g, "$1")
    const id = title
      .toLowerCase()
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
    items.push({ id, title, level })
  }
  return items
}

export interface SearchEntry {
  slug: string
  title: string
  section: string
  headings: { id: string; title: string }[]
  plainText: string
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\|.*\|$/gm, "")
    .replace(/^\s*[-|:]+\s*$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

export function buildSearchIndex(nav?: DocNavSection[]): SearchEntry[] {
  const sections = nav ?? docsNav
  const entries: SearchEntry[] = []

  for (const section of sections) {
    for (const item of section.items) {
      try {
        const content = getDocContent(item.slug)
        const toc = extractToc(content)
        entries.push({
          slug: item.slug,
          title: item.title,
          section: section.title,
          headings: toc.map((t) => ({ id: t.id, title: t.title })),
          plainText: stripMarkdown(content),
        })
      } catch {
        continue
      }
    }
  }

  return entries
}

export async function processMarkdown(content: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeSlug)
    .use(rehypePrettyCode, {
      theme: "github-dark-default",
      keepBackground: true,
    })
    .use(rehypeStringify)
    .process(content)
  return String(result).replace(
    /<table/g,
    '<div class="table-scroll-wrapper"><table'
  ).replace(/<\/table>/g, "</table></div>")
}
