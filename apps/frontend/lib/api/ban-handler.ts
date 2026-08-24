export async function checkBanResponse(res: Response): Promise<boolean> {
  if (res.status === 403) {
    try {
      const data = await res.clone().json()
      if (data?.detail?.type === "banned") {
        if (window.location.pathname !== "/appeal") {
          window.location.replace("/appeal")
        }
        return true
      }
    } catch {}
  }
  return false
}
