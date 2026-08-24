import { SubmitClient } from "./_components/submit-client"

export const dynamic = "force-dynamic"

export default async function SubmitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <SubmitClient slug={slug} />
}
