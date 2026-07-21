export type SplashVariant =
  | "app-boot"
  | "auth-restore"
  | "discord-connect"
  | "oauth-callback"
  | "scanner-prepare";

export const splashMessages: Record<SplashVariant, string> = {
  "app-boot": "Loading PackWatcher",
  "auth-restore": "Restoring your session",
  "discord-connect": "Connecting to Discord",
  "oauth-callback": "Completing sign-in",
  "scanner-prepare": "Preparing scanner"
};

export function splashMessageForVariant(variant: SplashVariant, override?: string) {
  return override?.trim() || splashMessages[variant];
}
