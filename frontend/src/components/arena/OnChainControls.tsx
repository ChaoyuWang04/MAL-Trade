import { useState } from "react";
import { usePaseoWallet } from "@/hooks/usePaseoWallet";
import { useStore } from "@/store";
import { sendPasTxViaMetamask } from "@/lib/paseoTx";

function truncate(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function OnChainControls() {
  const wallet = usePaseoWallet();
  const appendLog = useStore((s) => s.appendLog);
  const onChain = useStore((s) => s.onChain);
  const setOnChain = useStore((s) => s.setOnChain);
  const onChainLogs = useStore((s) => s.onChainLogs);
  const recordOnChainLog = useStore((s) => s.recordOnChainLog);
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

  const handleAutoToggle = () => {
    if (!wallet.isConnected) {
      appendLog({
        time: new Date().toISOString(),
        thought: "请先连接 MetaMask 后再开启自动上链。",
        type: "error",
      });
      return;
    }
    setOnChain({ autoSendLlm: !onChain.autoSendLlm });
  };

  const handleTestSend = async (action: "BUY" | "SELL") => {
    setPending(action);
    const to = action === "BUY" ? onChain.destinationBuy : onChain.destinationSell;
    try {
      const bal = wallet.balance ? parseFloat(wallet.balance) : 0;
      if (!bal || bal < 0.11) {
        const msg = "PAS 余额不足，至少需要 0.11 PAS；请先去 Faucet 领取。";
        appendLog({
          time: new Date().toISOString(),
          thought: msg,
          type: "error",
        });
        setPending(null);
        return;
      }
      const res = await sendPasTxViaMetamask({
        to,
        amount: 0.1,
        from: wallet.address,
      });
      appendLog({
        time: new Date().toISOString(),
        thought: `${action} on-chain 0.1 PAS -> ${to} (${res.hash})`,
        type: "trade",
        action,
      });
      recordOnChainLog({
        time: new Date().toISOString(),
        action,
        amount: 0.1,
        txHash: res.hash,
        status: "sent",
        note: "手动按钮",
      });
    } catch (e: any) {
      appendLog({
        time: new Date().toISOString(),
        thought: e?.message || "on-chain trade failed",
        type: "error",
      });
      recordOnChainLog({
        time: new Date().toISOString(),
        action,
        amount: 0.1,
        status: "failed",
        note: e?.message,
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
        {wallet.balance && (
          <div className="rounded bg-slate-800 px-2 py-1">
            Balance: {wallet.balance} PAS
          </div>
        )}
      </div>
      {wallet.balance && parseFloat(wallet.balance) < 0.11 && (
        <div className="text-amber-300">
          PAS 余额不足 0.11，发链上交易可能失败，请先领取 Faucet。
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleTestSend("BUY")}
          disabled={!wallet.isConnected || pending !== null}
          className="rounded bg-emerald-500 px-3 py-1 text-slate-900 hover:brightness-95 disabled:opacity-50"
        >
          BUY 0.1 PAS
        </button>
        <button
          onClick={() => handleTestSend("SELL")}
          disabled={!wallet.isConnected || pending !== null}
          className="rounded bg-red-500 px-3 py-1 text-slate-900 hover:brightness-95 disabled:opacity-50"
        >
          SELL 0.1 PAS
        </button>
        <a
          href={wallet.faucetUrl}
          target="_blank"
          className="rounded border border-amber-500 px-3 py-1 text-amber-200 hover:bg-amber-500/10"
          rel="noreferrer"
        >
          领取 PAS Faucet
        </a>
        <button
          onClick={handleAutoToggle}
          disabled={!wallet.isConnected}
          className={`rounded px-3 py-1 ${onChain.autoSendLlm ? "bg-emerald-600 text-slate-100" : "border border-slate-700 text-slate-200"}`}
        >
          LLM 自动上链 {onChain.autoSendLlm ? "开" : "关"}
        </button>
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
      {onChainLogs.length > 0 && (
        <div className="mt-2 space-y-1 rounded border border-slate-800 p-2 text-slate-200">
          <div className="text-xs font-semibold text-emerald-300">On-chain Tx Log</div>
          {onChainLogs
            .slice()
            .reverse()
            .map((log, idx) => (
              <div key={idx} className="text-xs text-slate-300">
                <span className="font-mono text-slate-400">{new Date(log.time).toLocaleTimeString()}</span>{" "}
                {log.action} {log.amount} PAS — {log.status}
                {log.txHash && (
                  <a
                    className="ml-2 underline"
                    href={`https://blockscout-passet-hub.parity-testnet.parity.io/tx/${log.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    hash
                  </a>
                )}
                {log.note && <span className="ml-2 text-slate-400">{log.note}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
