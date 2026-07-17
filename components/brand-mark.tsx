import Image from "next/image";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-16 w-16" : "h-10 w-10";

  return (
    <span className={`relative block overflow-hidden rounded-md border border-amber-300/50 bg-black shadow-[0_0_24px_rgba(255,208,47,0.16)] ${sizeClass}`}>
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-300/12 via-transparent to-cyan-300/10" />
      <Image src="/packwatch.png" alt="PackWatcher" fill sizes="64px" className="object-contain" priority={size !== "sm"} />
    </span>
  );
}

