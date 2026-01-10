import { useStore } from "@/store";

export function LogStream() {
  const logs = useStore((s) => s.logs);
  return (
    <div className="h-full overflow-y-auto rounded-xl bg-slate-900 p-3 text-sm text-slate-100">
      <div className="mb-2 text-xs font-semibold text-slate-400">Stream</div>
      <div className="space-y-2">
        {logs.slice().reverse().map((log, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{new Date(log.time).toLocaleTimeString()}</span>
              <span className={log.type === "error" ? "text-red-400" : "text-emerald-400"}>
                {log.type}
              </span>
            </div>
            {log.thought && <div className="text-xs text-slate-200">{log.thought}</div>}
            {log.action && (
              <div className="text-xs text-slate-300">
                → {log.action}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
