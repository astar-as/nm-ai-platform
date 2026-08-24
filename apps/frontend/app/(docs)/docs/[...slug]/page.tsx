export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { getDocContent, extractToc, processMarkdown, buildSearchIndex } from "@/lib/docs"
import { allSlugs, getDocMeta, getDocPrevNext, getRuntimeDocsNav, isDocSlugAllowed } from "@/lib/docs-nav"
import { DocsSidebarWithSearch } from "@/components/docs/docs-sidebar-with-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav"
import { CopyButtonInjector } from "@/components/docs/copy-button-injector"
import { CopyPageButton } from "@/components/docs/copy-page-button"
import { DocsPrevNext } from "@/components/docs/docs-prev-next"

export function generateStaticParams() {
  return allSlugs
    .filter((slug) => slug !== "getting-started")
    .map((slug) => ({ slug: slug.split("/") }))
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const joined = slug.join("/")
  if (!allSlugs.includes(joined) || joined === "getting-started") notFound()
  if (!isDocSlugAllowed(joined)) notFound()

  const runtimeNav = getRuntimeDocsNav()
  const content = getDocContent(joined)
  const toc = extractToc(content)
  const html = await processMarkdown(content)
  const meta = getDocMeta(joined)
  const searchEntries = buildSearchIndex(runtimeNav)
  const { prev, next } = getDocPrevNext(joined)

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
          <span className="text-sm text-muted-foreground">
            {meta?.section}
          </span>
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
