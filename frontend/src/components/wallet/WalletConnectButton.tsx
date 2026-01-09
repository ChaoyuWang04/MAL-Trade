"use client";

import { useMemo, useState } from "react";

import { usePolkadotWallet } from "@/hooks/usePolkadotWallet";

export function WalletConnectButton() {
  const wallet = usePolkadotWallet("MAL Trade");
  const [open, setOpen] = useState(false);

  const buttonLabel = useMemo(() => {
    if (wallet.status === "connecting") return "连接中…";
    if (wallet.status === "connected") return wallet.activeLabel ?? "已连接";
    return "连接钱包";
  }, [wallet.activeLabel, wallet.status]);

  const disabled = wallet.status === "connecting";

  if (!wallet.canUseExtension) {
    return (
      <a
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
        href="https://polkadot.js.org/extension/"
        target="_blank"
        rel="noreferrer"
      >
        安装钱包
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={async () => {
          if (wallet.status !== "connected") {
            await wallet.connect();
            return;
          }
          setOpen((v) => !v);
        }}
        type="button"
      >
        {buttonLabel}
      </button>

      {wallet.errorMessage ? (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
          {wallet.errorMessage}
        </div>
      ) : null}

      {wallet.status === "connected" && open ? (
        <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-lg border border-white/10 bg-neutral-950">
          <div className="px-3 py-2 text-xs text-white/60">账户</div>
          <div className="max-h-56 overflow-auto">
            {wallet.accounts.length === 0 ? (
              <div className="px-3 py-2 text-sm text-white/80">未找到账户</div>
            ) : (
              wallet.accounts.map((account) => {
                const active = account.address === wallet.activeAddress;
                return (
                  <button
                    key={account.address}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5 ${
                      active ? "bg-white/5" : ""
                    }`}
                    onClick={() => {
                      wallet.setActiveAddress(account.address);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="truncate text-white/90">
                      {account.name ?? account.address}
                    </span>
                    <span className="ml-3 shrink-0 text-xs text-white/50">
                      {account.source ?? "wallet"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-white/10 p-2">
            <button
              className="rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/5"
              onClick={() => setOpen(false)}
              type="button"
            >
              关闭
            </button>
            <button
              className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/90 hover:bg-white/15"
              onClick={() => {
                wallet.disconnect();
                setOpen(false);
              }}
              type="button"
            >
              断开
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

