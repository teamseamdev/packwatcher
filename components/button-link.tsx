import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
};

export function ButtonLink({ href, children, variant = "primary", size = "md" }: Props) {
  const classes = [
    "inline-flex items-center justify-center rounded-lg font-semibold transition",
    size === "sm" ? "h-10 px-4 text-sm" : "h-12 px-5 text-sm",
    variant === "primary"
      ? "bg-teal-300 text-slate-950 hover:bg-teal-200"
      : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
  ].join(" ");

  return <Link href={href} className={classes}>{children}</Link>;
}
