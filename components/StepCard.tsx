export type StepStatus = "idle" | "running" | "done" | "error";

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
  );
}

export function StepCard({
  title,
  status,
  badge,
  children,
}: {
  title: string;
  status: StepStatus;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const isActive = status !== "idle";
  return (
    <div
      className={`rounded-xl border bg-white p-4 transition-all duration-300 ${
        status === "running"
          ? "border-blue-400 shadow-md animate-pulse-border"
          : status === "error"
            ? "border-red-300"
            : isActive
              ? "border-gray-200 shadow-sm"
              : "border-gray-100 opacity-50"
      } ${isActive ? "animate-fade-in" : ""}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <div className="flex items-center gap-2">
          {badge}
          {status === "running" && <Spinner />}
          {status === "done" && (
            <span className="text-xs font-medium text-emerald-600">done</span>
          )}
          {status === "error" && (
            <span className="text-xs font-medium text-red-600">failed</span>
          )}
        </div>
      </div>
      {isActive && <div className="mt-3">{children}</div>}
    </div>
  );
}
