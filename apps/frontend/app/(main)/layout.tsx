import { Background } from "@/components/background"
import { Header, Footer, BottomNav } from "@/components/layout"
import { PageTransition } from "@/components/page-transition"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Background />
      <div className="min-h-screen flex flex-col relative">
        <Header />
        <main className="flex-1 container px-4 py-8 pb-24 md:pb-8 max-w-5xl mx-auto print:max-w-none print:p-0">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
        <BottomNav />
      </div>
    </>
  )
}
