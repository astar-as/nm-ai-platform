"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import type { User, Team, AuthState } from "@/types/auth"
import { API_BASE } from "@/lib/api"
import { checkBanResponse } from "@/lib/api/ban-handler"

interface AuthContextType extends AuthState {
  loginWithProvider: (provider: "google") => void
  loginWithMock: () => Promise<void>
  handleAuthCallback: () => Promise<User>
  logout: () => void
  refreshUser: () => Promise<void>
  refreshTeam: () => Promise<void>
  createTeam: (name: string) => Promise<Team>
  joinTeam: (invite_code: string) => Promise<Team>
  leaveTeam: () => Promise<void>
  renameTeam: (name: string) => Promise<void>
  deleteTeam: () => Promise<void>
  inviteByEmail: (email: string) => Promise<void>
  revokeInvite: (inviteId: string) => Promise<void>
  joinByInvite: (token: string) => Promise<Team>
  transferCaptain: (userId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function api(path: string, init?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...init?.headers,
    },
  }).then(async (res) => {
    await checkBanResponse(res)
    return res
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    team: null,
    isLoading: true,
    isAuthenticated: false,
  })

  const fetchUser = useCallback(async (): Promise<User | null> => {
    try {
      const res = await api("/users/me")
      if (!res.ok) return null
      return res.json()
    } catch {
      return null
    }
  }, [])

  const fetchTeam = useCallback(async (): Promise<Team | null> => {
    try {
      const res = await api("/teams/my")
      if (!res.ok) return null
      return res.json()
    } catch {
      return null
    }
  }, [])

  const refreshUser = useCallback(async () => {
    const user = await fetchUser()
    if (user) setState((s) => ({ ...s, user }))
  }, [fetchUser])

  const refreshTeam = useCallback(async () => {
    const team = await fetchTeam()
    setState((s) => ({ ...s, team }))
  }, [fetchTeam])

  useEffect(() => {
    const restoreSession = async () => {
      const user = await fetchUser()
      if (!user) {
        setState((s) => ({ ...s, user: null, team: null, isLoading: false, isAuthenticated: false }))
        return
      }

      setState((s) => ({ ...s, user, team: null, isLoading: true, isAuthenticated: true }))
      const team = await fetchTeam()
      setState((s) => ({ ...s, user, team, isLoading: false, isAuthenticated: true }))
    }

    restoreSession()
  }, [fetchUser, fetchTeam])

  const loginWithProvider = (provider: "google") => {
    const loginUrl = new URL("/auth/login", API_BASE)
    loginUrl.searchParams.set("provider", provider)
    window.location.assign(loginUrl)
  }

  const loginWithMock = useCallback(async () => {
    const res = await api("/auth/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "developer@example.com",
        name: "Local Developer",
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Development login is unavailable")
    }

    const user = await fetchUser()
    if (!user) {
      throw new Error("Development login did not create a session")
    }

    const team = await fetchTeam()
    setState({ user, team, isLoading: false, isAuthenticated: true })
  }, [fetchUser, fetchTeam])

  const handleAuthCallback = useCallback(async (): Promise<User> => {
    const user = await fetchUser()
    if (!user) {
      throw new Error("Failed to fetch user profile")
    }

    const pendingInvite = localStorage.getItem("pending_invite_token")
    if (pendingInvite) {
      localStorage.removeItem("pending_invite_token")
      try {
        const res = await api("/teams/join-by-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: pendingInvite }),
        })
        if (res.ok) {
          const team = await res.json()
          setState({ user, team, isLoading: false, isAuthenticated: true })
          return user
        }
      } catch {
      }
    }

    const team = await fetchTeam()
    setState({ user, team, isLoading: false, isAuthenticated: true })
    return user
  }, [fetchUser, fetchTeam])

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" })
    } catch {
    }
    setState({ user: null, team: null, isLoading: false, isAuthenticated: false })
  }, [])

  const createTeamFn = async (name: string): Promise<Team> => {
    const res = await api("/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Failed to create team")
    }

    const team = await res.json()
    setState((s) => ({ ...s, team }))
    return team
  }

  const joinTeamFn = async (invite_code: string): Promise<Team> => {
    const res = await api("/teams/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Invalid invite code")
    }

    const team = await res.json()
    setState((s) => ({ ...s, team }))
    return team
  }

  const leaveTeamFn = async (): Promise<void> => {
    if (!state.team) return

    const res = await api(`/teams/${state.team.id}/leave`, { method: "POST" })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Failed to leave team")
    }

    setState((s) => ({ ...s, team: null }))
  }

  const renameTeamFn = async (name: string): Promise<void> => {
    if (!state.team) return

    const res = await api(`/teams/${state.team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Failed to rename team")
    }

    const team = await res.json()
    setState((s) => ({ ...s, team }))
  }

  const deleteTeamFn = async (): Promise<void> => {
    if (!state.team) return

    const res = await api(`/teams/${state.team.id}`, { method: "DELETE" })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Failed to delete team")
    }

    setState((s) => ({ ...s, team: null }))
  }

  const inviteByEmailFn = async (email: string): Promise<void> => {
    if (!state.team) return

    const res = await api(`/teams/${state.team.id}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Failed to send invite")
    }

    const team = await res.json()
    setState((s) => ({ ...s, team }))
  }

  const revokeInviteFn = async (inviteId: string): Promise<void> => {
    if (!state.team) return

    const res = await api(`/teams/${state.team.id}/invite/${inviteId}`, { method: "DELETE" })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Failed to revoke invite")
    }

    const team = await res.json()
    setState((s) => ({ ...s, team }))
  }

  const transferCaptainFn = async (userId: string): Promise<void> => {
    if (!state.team) return

    const res = await api(`/teams/${state.team.id}/transfer-captain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Failed to transfer captainship")
    }

    const team = await res.json()
    setState((s) => ({ ...s, team }))
  }

  const joinByInviteFn = async (inviteToken: string): Promise<Team> => {
    const res = await api("/teams/join-by-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || "Invalid or expired invite")
    }

    const team = await res.json()
    setState((s) => ({ ...s, team }))
    return team
  }

  return (
    <AuthContext.Provider value={{
      ...state,
      loginWithProvider,
      loginWithMock,
      handleAuthCallback,
      logout,
      refreshUser,
      refreshTeam,
      createTeam: createTeamFn,
      joinTeam: joinTeamFn,
      leaveTeam: leaveTeamFn,
      renameTeam: renameTeamFn,
      deleteTeam: deleteTeamFn,
      inviteByEmail: inviteByEmailFn,
      revokeInvite: revokeInviteFn,
      joinByInvite: joinByInviteFn,
      transferCaptain: transferCaptainFn,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
