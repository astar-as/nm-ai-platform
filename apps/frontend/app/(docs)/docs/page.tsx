export const dynamic = "force-dynamic"

import { getDocContent, extractToc, processMarkdown, buildSearchIndex } from "@/lib/docs"
import { getDocPrevNext, getRuntimeDocsNav } from "@/lib/docs-nav"
import { DocsSidebarWithSearch } from "@/components/docs/docs-sidebar-with-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav"
import { CopyButtonInjector } from "@/components/docs/copy-button-injector"
import { CopyPageButton } from "@/components/docs/copy-page-button"
import { DocsPrevNext } from "@/components/docs/docs-prev-next"

const SLACK_INVITE_URL = process.env.NEXT_PUBLIC_SLACK_INVITE_URL || ""

export default async function DocsPage() {
  let content = getDocContent("getting-started")
  if (SLACK_INVITE_URL) {
    content = content.replace(/SLACK_INVITE_URL/g, SLACK_INVITE_URL)
  } else {
    content = content.replace(/\[([^\]]+)\]\(SLACK_INVITE_URL\)/g, "**$1**")
  }
  const runtimeNav = getRuntimeDocsNav()
  const toc = extractToc(content)
  const html = await processMarkdown(content)
  const searchEntries = buildSearchIndex(runtimeNav)
  const { prev, next } = getDocPrevNext("getting-started")

  return (
    <div className="mx-auto flex max-w-[1400px]">
      <aside className="hidden lg:block w-64 shrink-0 border-r border-border/40">
        <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-6 px-4">
          <DocsSidebarWithSearch entries={searchEntries} nav={runtimeNav} />
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-6 py-8 lg:px-10">
        <DocsMobileNav entries={searchEntries} nav={runtimeNav} />
        <div className="mb-6 flex items-center justify-between max-w-3xl">
          <span className="text-sm text-muted-foreground">Overview</span>
          <CopyPageButton />
        </div>
        <article
          className="prose max-w-3xl"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <CopyButtonInjector />
        <DocsPrevNext prev={prev} next={next} />
      </main>

      <aside className="hidden xl:block w-56 shrink-0">
        <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-6 px-4">
          <DocsToc items={toc} />
        </div>
      </aside>
    </div>
  )
}
