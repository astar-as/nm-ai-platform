import Image from "next/image"
import { appName } from "@/lib/branding"

export function ThemeLogo({ width, height, className, priority }: { width: number; height: number; className?: string; priority?: boolean }) {
  return (
    <>
      <Image src="/logo.svg" alt={appName} width={width} height={height} priority={priority} className={`dark:hidden ${className ?? ""}`} />
      <Image src="/logo-light.svg" alt={appName} width={width} height={height} priority={priority} className={`hidden dark:block ${className ?? ""}`} />
    </>
  )
}
