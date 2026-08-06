export function KeyValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100 last:border-b-0 sm:flex-row sm:gap-3">
      <dt className="w-full shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400 sm:w-40">
        {label}
      </dt>
      <dd className="text-sm text-gray-800">{value}</dd>
    </div>
  );
}

export function KeyValueList({ children }: { children: React.ReactNode }) {
  return <dl className="flex flex-col">{children}</dl>;
}

export function Bool({ value }: { value: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        value ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {value ? "true" : "false"}
    </span>
  );
}
