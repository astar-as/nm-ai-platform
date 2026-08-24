import type { Metadata } from "next"
import { Background } from "@/components/background"
import Link from "next/link"
import { appName, supportEmail } from "@/lib/branding"

export const metadata: Metadata = {
  title: `Privacy Policy | ${appName}`,
  description: `Privacy policy for the ${appName} competition platform`,
}

export default function PrivacyPage() {
  return (
    <>
      <Background />
      <main className="min-h-screen flex flex-col items-center px-4 py-16 relative">
        <div className="w-full max-w-2xl space-y-8">
          <div>
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors no-underline"
            >
              &larr; Back
            </Link>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">
              This is a template privacy policy. Operators of this platform should replace it
              with their own policy before going live.
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Data Controller</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The organization operating this {appName} instance.<br />
              Contact: {supportEmail}
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">What We Collect</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              When you sign in and use the competition platform, we collect:
            </p>
            <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
              <li>Name and email address (from your Google account or magic link sign-in)</li>
              <li>Profile picture (from your Google account, if available)</li>
              <li>Occupation (optional, if you choose to provide it)</li>
              <li>Team membership and competition submissions (submitted solutions and results)</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Purpose</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We use your data to operate the competition: authenticating your account,
              managing teams, processing submissions, displaying leaderboards, and
              communicating competition updates.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We may also publish aggregate statistics and analysis based on the competition.
              All public outputs use anonymized/aggregated data. Individuals are not
              identified without separate consent.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Legal Basis</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Consent. By signing in, you consent to the processing of your data as described
              in this policy. You can withdraw your consent at any time by contacting us.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Cookies</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This website uses the following cookies:
            </p>
            <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
              <li><strong>access_token</strong> — An HTTP-only, secure authentication cookie that keeps
                you signed in. It is automatically refreshed while you use the platform. This
                cookie is essential for the service to function and cannot be disabled.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Third Parties</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We use third-party services (such as an OAuth provider for authentication, an
              email delivery service, and a cloud hosting provider) to operate the platform.
              We do not sell your data.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Data Retention</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Competition data is retained through the event and for a limited period
              afterwards. You can request deletion at any time by contacting us at {supportEmail}.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Your Rights</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Depending on your jurisdiction, you may have the right to:
            </p>
            <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
              <li>Access your personal data</li>
              <li>Request correction or deletion of your data</li>
              <li>Withdraw consent at any time</li>
              <li>File a complaint with your local data protection authority</li>
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Contact us at {supportEmail} to exercise your rights.
            </p>
          </section>
        </div>
      </main>
    </>
  )
}
