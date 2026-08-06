export function RawJsonToggle({ data }: { data: unknown }) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600 select-none">
        raw JSON
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-200 scrollbar-thin">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
