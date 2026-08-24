"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuth } from "@/app/_providers/auth-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Loader2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { joinTeamSchema, type JoinTeamInput } from "@/lib/validations"

export function JoinTeamForm() {
  const [isLoading, setIsLoading] = useState(false)
  const { joinTeam } = useAuth()
  const router = useRouter()

  const form = useForm<JoinTeamInput>({
    resolver: zodResolver(joinTeamSchema),
    defaultValues: {
      inviteCode: "",
    },
  })

  async function onSubmit(data: JoinTeamInput) {
    setIsLoading(true)
    try {
      await joinTeam(data.inviteCode)
      toast.success("Joined team!")
      router.push("/dashboard?joined=1")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid invite code")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Join Team
        </CardTitle>
        <CardDescription>Got an invite code from your teammate?</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="inviteCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invite Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ABCD1234"
                      {...field}
                      className="uppercase tracking-widest font-mono"
                      maxLength={8}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : (
                "Join Team"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
