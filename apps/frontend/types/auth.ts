export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  auth_provider?: string
  occupation?: string | null
  github_username?: string | null
  linkedin_url?: string | null
  x_username?: string | null
  is_admin?: boolean
}

export interface PendingInvite {
  id: string
  email: string
}

export interface Team {
  id: string
  name: string
  slug: string
  invite_code: string
  members: TeamMember[]
  pending_invites: PendingInvite[]
}

export interface TeamMember {
  id: string
  user_id: string
  name: string
  email: string
  role: "captain" | "member"
  avatar_url?: string
}

export interface AuthState {
  user: User | null
  team: Team | null
  isLoading: boolean
  isAuthenticated: boolean
}
