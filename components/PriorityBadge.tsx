const STYLES: Record<string, string> = {
  P0: "bg-red-600 text-white",
  P1: "bg-orange-500 text-white",
  P2: "bg-yellow-400 text-yellow-950",
  P3: "bg-gray-400 text-white",
};

export function PriorityBadge({ level, size = "lg" }: { level: string; size?: "sm" | "lg" }) {
  const cls = STYLES[level] ?? "bg-gray-300 text-gray-800";
  const sizeCls = size === "lg" ? "text-2xl px-5 py-2" : "text-xs px-2 py-0.5";
  return (
    <span className={`inline-flex items-center justify-center rounded-lg font-bold tracking-wide ${sizeCls} ${cls}`}>
      {level}
    </span>
  );
}
