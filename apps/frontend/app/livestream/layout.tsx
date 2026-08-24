import { Background } from "@/components/background"

export default function LivestreamLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Background />
      <div className="min-h-screen relative">
        {children}
      </div>
    </>
  )
}
