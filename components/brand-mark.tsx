import Image from "next/image";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-16 w-16" : "h-10 w-10";

  return (
    <span className={`relative block overflow-hidden rounded-lg border border-amber-300/40 bg-slate-950 ${sizeClass}`}>
      <Image src="/packwatch.png" alt="PackWatcher" fill sizes="64px" className="object-contain" priority={size !== "sm"} />
    </span>
  );
}

