"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { appName } from "@/lib/branding"

export function RulesClient() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Rules &amp; Regulations</h1>
        <p className="text-muted-foreground print:text-black">
          {appName}
        </p>
      </div>

      <CompetitionRules />

      <p className="text-center text-xs text-muted-foreground">
        Rules are subject to change — check back for updates.
      </p>
    </div>
  )
}

function SectionHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-none flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
        {number}
      </span>
      <h3 className="font-semibold text-base">{title}</h3>
    </div>
  )
}

function SubHeading({ id, title }: { id: string; title: string }) {
  return <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">{id} {title}</h4>
}

function RuleList({ items }: { items: string[] }) {
  return (
    <ul className="text-sm space-y-2 ml-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-muted-foreground mt-1 shrink-0">&#8226;</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function CompetitionRules() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={1} title="Overview" />
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {appName} is a task-oriented AI competition. Teams compete across independent
            AI challenges within the competition window. All scoring is automated and
            updated in real-time throughout the competition. The leaderboard at the
            deadline determines the preliminary results, subject to code review and
            verification by the organizers before official rankings are published.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={2} title="Schedule" />
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            The competition opens and closes at the times announced on the platform. The
            competition is fully virtual — all submissions, evaluations, and scoring take
            place through the platform.
          </p>
          <p className="text-sm text-muted-foreground">
            No submissions made after the deadline will be evaluated or counted toward the
            final results. Submissions that are in-flight (queued or processing) at the
            deadline will be completed and scored normally.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={3} title="Eligibility" />
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Participation is open to all registered teams. To be eligible for prizes, teams
            must meet the requirements described in Section 5.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={4} title="Teams" />
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Teams consist of 1 member up to the operator-configured maximum. Each person may only be a member of one team.
            Teams can be altered as long as they have zero submissions in any task. Once a
            team makes their first submission, the roster is locked — members cannot be
            added or removed after that point.
          </p>
          <p className="text-sm">
            Teams are responsible for their own infrastructure, compute resources, and
            coordination. The organizers do not provide hosting or development environments
            beyond what is available through the platform.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={5} title="Prize Eligibility" />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            The organizers publish prize eligibility, verification, licensing, and final
            material requirements for each deployment. Those published terms apply in
            addition to the platform-enforced controls described here.
          </p>
          <p className="text-sm">
            A leaderboard position alone does not establish prize eligibility until the
            organizers complete their announced verification process.
          </p>
        </CardContent>
      </Card>

      <Separator className="my-2" />

      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={6} title="Tasks" />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            The competition consists of independent AI challenges. Each task has its own
            submission format, scoring methodology, and rate limits, published on the
            platform. Teams are not required to participate in all tasks but will only
            accumulate points for tasks they submit to.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={7} title="Overall Scoring & Ranking" />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            The overall leaderboard combines scores from all tasks using the following
            methodology:
          </p>
          <RuleList items={[
            "Each task's scores are normalized to a 0-100 scale against fixed, published bounds and its configured score direction.",
            "The overall score is the configured weighted average of normalized task scores.",
            "Teams are ranked by overall score in descending order.",
          ]} />
          <Separator />
          <p className="text-sm">
            Tasks where a team has not submitted receive a normalized score of 0. Competing
            in all tasks is strongly advantageous.
          </p>
          <p className="text-sm text-muted-foreground">
            The leaderboard updates in real-time. The leaderboard snapshot at the deadline
            determines preliminary rankings. Official results are published only after code
            review and verification by the organizers.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={8} title="Final Materials & Verification" />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            If the organizers require source code, model artifacts, reports, or other final
            materials, the team captain must submit the requested links through the platform
            before the announced deadline.
          </p>
          <p className="text-sm">
            The required contents, visibility, license, retention, and review process are set
            by the organizers and must be stated before the competition begins.
          </p>
          <Separator />
          <p className="text-sm font-medium">The organizers will review submitted code to verify:</p>
          <RuleList items={[
            "The solution reflects genuine AI/ML work produced by the team",
            "No evidence of code sharing or collusion with other teams",
            "No hardcoded or pre-computed responses designed to game specific test cases",
          ]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={9} title="Fair Play & Prohibited Conduct" />
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm">
            The purpose of this competition is to build effective AI solutions through genuine
            technical skill. The use of AI coding assistants, publicly available models,
            datasets, research papers, and open-source libraries is explicitly permitted and
            encouraged.
          </p>
          <p className="text-sm font-medium">
            The following actions are strictly prohibited:
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <SubHeading id="9.1" title="Collusion & Solution Sharing" />
              <RuleList items={[
                "Sharing code, model weights, trained models, or task-specific solutions between teams — whether directly, through intermediaries, or through any public or private channel",
                "Sharing competition-specific observations that provide a competitive advantage between teams",
                "Coordinating submissions, strategies, or division of labor between teams",
              ]} />
            </div>

            <div className="space-y-2">
              <SubHeading id="9.2" title="Identity & Account Manipulation" />
              <RuleList items={[
                "Participating on more than one team, directly or through proxies",
                "Creating additional accounts or teams to gain extra submissions or queries",
                "Transferring, selling, or sharing team credentials or platform access",
              ]} />
            </div>

            <div className="space-y-2">
              <SubHeading id="9.3" title="Platform Abuse" />
              <RuleList items={[
                "Circumventing rate limits, cooldowns, or submission quotas",
                "Attacking, probing, or degrading platform infrastructure, evaluation systems, or other teams’ endpoints",
                "Attempting to extract test data, ground truth, hidden parameters, or evaluation logic from the platform",
              ]} />
            </div>

            <div className="space-y-2">
              <SubHeading id="9.4" title="Score Manipulation" />
              <RuleList items={[
                "Submitting hardcoded or pre-computed responses that do not reflect genuine model capabilities",
                "Engineering submissions designed to manipulate scoring normalization rather than to maximize task performance",
                "Any form of score falsification or result tampering",
              ]} />
            </div>
          </div>

          <Separator />

          <p className="text-sm">
            If you are uncertain whether a technique or approach is permitted, contact the
            organizers <strong>before</strong> using it.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <SectionHeading number={10} title="Monitoring & Enforcement" />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            The organizers actively monitor the platform, official communication channels,
            submission patterns, and code repositories throughout the competition. Violations
            are handled at the sole discretion of the jury. Consequences range from a warning
            to prize ineligibility, score removal, or a platform ban.
          </p>
          <p className="text-sm text-muted-foreground">
            Where code similarity or collusion is suspected, the organizers may require
            involved teams to demonstrate independent work. Failure to do so may result in
            consequences for all involved teams.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <section className="space-y-3">
            <SectionHeading number={11} title="Platform Availability" />
            <p className="text-sm">
              The organizers will make all reasonable efforts to maintain platform availability
              throughout the competition. The organizers accept no liability for downtime,
              latency, or technical failures caused by infrastructure, third-party services,
              or circumstances beyond their control.
            </p>
          </section>

          <Separator />

          <section className="space-y-3">
            <SectionHeading number={12} title="Intellectual Property" />
            <p className="text-sm">
              Ownership, licensing, publication, and publicity terms are determined by the
              organizer&apos;s published competition terms. The platform does not impose a
              license on participant work.
            </p>
          </section>

          <Separator />

          <section className="space-y-3">
            <SectionHeading number={13} title="Code of Conduct" />
            <p className="text-sm">
              Participants are expected to engage respectfully with other teams and organizers
              across all channels. Harassment, hate speech, threats, or disruptive behavior
              will not be tolerated and may result in immediate removal from the competition.
            </p>
          </section>

          <Separator />

          <section className="space-y-3">
            <SectionHeading number={14} title="Data & Privacy" />
            <p className="text-sm">
              Submissions and associated metadata may be analyzed for quality assurance and
              anti-cheating purposes. Personal data is handled in accordance with applicable
              data protection regulations. See the privacy policy for details.
            </p>
          </section>

          <Separator />

          <section className="space-y-3">
            <SectionHeading number={15} title="Jury & Amendments" />
            <p className="text-sm">
              The jury appointed by the organizers is responsible for interpreting these rules,
              resolving disputes, and making all final decisions regarding scores, eligibility,
              disqualifications, and prize distribution. All jury decisions are final and
              binding.
            </p>
            <p className="text-sm text-muted-foreground">
              These rules may be updated at any time before or during the competition. Material
              changes will be communicated through the platform. Continued participation after
              a rule change constitutes acceptance of the updated rules.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
