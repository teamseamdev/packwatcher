export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-white/10" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg bg-white/10" />
        ))}
      </div>
    </div>
  );
}
