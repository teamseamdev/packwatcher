const FALLBACK_AUTH_ROUTE = "/dashboard";

export function safeAuthRedirect(input: string | null | undefined, fallback = FALLBACK_AUTH_ROUTE) {
  if (!input) return fallback;

  try {
    const decoded = decodeURIComponent(input);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
    if (/[\r\n]/.test(decoded)) return fallback;
    return decoded;
  } catch {
    return fallback;
  }
}

export function authErrorMessage(input: string | null | undefined) {
  const message = input ?? "";
  if (/access_denied|cancel/i.test(message)) return "Discord sign-in was canceled.";
  if (/pkce|verifier|expired/i.test(message)) return "Your sign-in session expired. Please try again.";
  if (/state/i.test(message)) return "We couldn't verify the sign-in session. Please try again.";
  if (/conflict|already/i.test(message)) return "This account is already linked another way. Try your original sign-in method.";
  if (!message) return "We couldn't complete sign-in.";
  return "We couldn't complete sign-in. Please try again.";
}
