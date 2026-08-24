export const appName = process.env.NEXT_PUBLIC_APP_NAME || "AI Championship"

export const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3003"

export const appHost = appUrl.replace(/^https?:\/\//, "")

export const competitionSlug = process.env.NEXT_PUBLIC_COMPETITION_SLUG || "demo-championship"

export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com"
