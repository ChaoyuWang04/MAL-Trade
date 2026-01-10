import { useState } from "react";
import { usePaseoWallet } from "@/hooks/usePaseoWallet";
import { useStore } from "@/store";

function truncate(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function OnChainControls() {
  const wallet = usePaseoWallet();
  const appendLog = useStore((s) => s.appendLog);
  const [pending, setPending] = useState<"BUY" | "SELL" | null>(null);

  const handleTrade = async (action: "BUY" | "SELL") => {
    setPending(action);
    try {
      const res = await wallet.sendPasTx({ action, amount: 0.01 });
      appendLog({
        time: new Date().toISOString(),
        thought: `${action} on-chain sent: ${res.hash}`,
        type: "trade",
        action,
      });
    } catch (e: any) {
      appendLog({
        time: new Date().toISOString(),
        thought: e?.message || "on-chain trade failed",
        type: "error",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-amber-300">On-chain PAS</div>
        {wallet.isConnected ? (
          <div className="text-emerald-300">Connected</div>
        ) : (
          <button
            onClick={wallet.connect}
            className="rounded border border-emerald-500 px-2 py-1 text-emerald-200 hover:bg-emerald-500/10"
          >
            Connect MetaMask
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="rounded bg-slate-800 px-2 py-1">
          {wallet.address ? truncate(wallet.address) : "Wallet: not connected"}
        </div>
        <div className="rounded bg-slate-800 px-2 py-1">
          Network: {wallet.isCorrectNetwork ? "Paseo" : "switching required"}
        </div>
        {wallet.balance && <div className="rounded bg-slate-800 px-2 py-1">Balance: {wallet.balance} PAS</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleTrade("BUY")}
          disabled={!wallet.isConnected || pending !== null}
          className="rounded bg-emerald-500 px-3 py-1 text-slate-900 hover:brightness-95 disabled:opacity-50"
        >
          BUY 0.01 PAS
        </button>
        <button
          onClick={() => handleTrade("SELL")}
          disabled={!wallet.isConnected || pending !== null}
          className="rounded bg-red-500 px-3 py-1 text-slate-900 hover:brightness-95 disabled:opacity-50"
        >
          SELL 0.01 PAS
        </button>
        <a
          href={wallet.faucetUrl}
          target="_blank"
          className="rounded border border-amber-500 px-3 py-1 text-amber-200 hover:bg-amber-500/10"
          rel="noreferrer"
        >
          领取 PAS Faucet
        </a>
      </div>
      {wallet.lastExplorerUrl && (
        <div className="text-emerald-300">
          Tx sent:{" "}
          <a
            href={wallet.lastExplorerUrl}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {wallet.lastTxHash}
          </a>
        </div>
      )}
      {wallet.error && <div className="text-red-400">{wallet.error}</div>}
      <div className="text-slate-400">
        未检测到 PAS？点击连接将自动添加/切换到 Paseo 测试网。如余额不足，使用 Faucet 领取测试币。
      </div>
    </div>
  );
}
