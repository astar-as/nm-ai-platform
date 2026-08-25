# Getting Started

Welcome to the competition platform documentation. This platform hosts task-oriented AI competitions: teams sign up, submit solutions to one or more tasks, and climb a live leaderboard.

## For Participants

1. Sign in with Google or a magic link
2. Create or join a team
3. Explore the open tasks on the Tasks page
4. Submit your solution (for code-upload tasks, a ZIP of your model code)
5. Track your results on the leaderboard

Your overall score is a weighted combination of task scores normalized against fixed, published bounds. Tasks you skip count as zero when they carry overall weight.

## For Operators

This platform is an open-source championship shell. To run your own competition:

- Configure branding via environment variables: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_COMPETITION_SLUG`, `NEXT_PUBLIC_SUPPORT_EMAIL`
- Define your competition, tasks, and schedules in the backend
- Replace the placeholder logos in `public/` and this documentation with your own content
- Update the rules, prizes, and privacy pages to match your event

## Need Help?

- Join the community channel linked from your dashboard, if the operators have configured one
- Check the [Rules](/rules) page for competition regulations
