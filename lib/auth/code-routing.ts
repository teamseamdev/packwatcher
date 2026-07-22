export function shouldRouteCodeToSupabaseAuth(pathname: string, hasCode: boolean) {
  return hasCode && pathname !== "/auth/callback" && !pathname.startsWith("/api/");
}
