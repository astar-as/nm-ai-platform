"use client"

import { useEffect } from "react"

export function CopyButtonInjector() {
  useEffect(() => {
    const codeBlocks = document.querySelectorAll("[data-rehype-pretty-code-figure] pre")

    codeBlocks.forEach((pre) => {
      if (pre.querySelector("[data-copy-button]")) return

      const button = document.createElement("button")
      button.setAttribute("data-copy-button", "true")
      button.className =
        "absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 transition-colors opacity-0 group-hover:opacity-100"
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-400"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`

      button.addEventListener("click", () => {
        const code = pre.querySelector("code")
        if (!code) return
        navigator.clipboard.writeText(code.textContent || "")
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-400"><polyline points="20 6 9 17 4 12"/></svg>`
        setTimeout(() => {
          button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-400"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
        }, 2000)
      })

      const figure = pre.closest("[data-rehype-pretty-code-figure]")
      if (figure) {
        ;(figure as HTMLElement).style.position = "relative"
        figure.classList.add("group")
        figure.appendChild(button)
      }
    })
  }, [])

  return null
}
