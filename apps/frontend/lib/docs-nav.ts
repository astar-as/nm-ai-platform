export interface DocNavItem {
  title: string
  slug: string
}

export interface DocNavSection {
  title: string
  items: DocNavItem[]
}

export const docsNav: DocNavSection[] = [
  {
    title: "Overview",
    items: [{ title: "Getting Started", slug: "getting-started" }],
  },
]

export const allSlugs = docsNav.flatMap((s) => s.items.map((i) => i.slug))

export function getDocMeta(slug: string) {
  for (const section of docsNav) {
    const item = section.items.find((i) => i.slug === slug)
    if (item) return { section: section.title, title: item.title }
  }
  return null
}

const flatItems = docsNav.flatMap((s) => s.items)

export function getDocPrevNext(slug: string) {
  const idx = flatItems.findIndex((i) => i.slug === slug)
  if (idx === -1) return { prev: null, next: null }
  const prev = idx > 0 ? flatItems[idx - 1] : null
  const next = idx < flatItems.length - 1 ? flatItems[idx + 1] : null
  return { prev, next }
}

export function slugToHref(slug: string) {
  return slug === "getting-started" ? "/docs" : `/docs/${slug}`
}

export function getRuntimeDocsNav(): DocNavSection[] {
  return docsNav
}

export function isDocSlugAllowed(slug: string): boolean {
  return allSlugs.includes(slug)
}
