"use client";

import { useCallback, useMemo, useState } from "react";

type WalletAccount = {
  address: string;
  name?: string;
  source?: string;
};

type WalletStatus = "idle" | "connecting" | "connected" | "error";

function shortenAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function usePolkadotWallet(appName: string) {
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeAccount = useMemo(() => {
    if (!activeAddress) return null;
    return accounts.find((account) => account.address === activeAddress) ?? null;
  }, [accounts, activeAddress]);

  const canUseExtension = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).injectedWeb3);
  }, []);

  const connect = useCallback(async () => {
    setErrorMessage(null);
    setStatus("connecting");

    try {
      const injected = (window as any).injectedWeb3 as
        | Record<string, { enable: (name: string) => Promise<any> }>
        | undefined;

      if (!injected || Object.keys(injected).length === 0) {
        setStatus("error");
        setErrorMessage("未检测到波卡钱包插件（Polkadot{.js} extension）");
        return;
      }

      const preferredKey = injected["polkadot-js"] ? "polkadot-js" : null;
      const providerKey = preferredKey ?? Object.keys(injected)[0];
      const provider = injected[providerKey];

      const enabled = await provider.enable(appName);
      const fetched = (await enabled?.accounts?.get?.()) as
        | Array<{ address: string; meta?: { name?: string; source?: string } }>
        | undefined;

      const normalized: WalletAccount[] = (fetched ?? []).map((account) => ({
        address: account.address,
        name: account.meta?.name,
        source: account.meta?.source
      }));

      setAccounts(normalized);
      setActiveAddress(normalized[0]?.address ?? null);
      setStatus("connected");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "钱包连接失败"
      );
    }
  }, [appName]);

  const disconnect = useCallback(() => {
    setAccounts([]);
    setActiveAddress(null);
    setErrorMessage(null);
    setStatus("idle");
  }, []);

  return {
    status,
    accounts,
    activeAddress,
    activeAccount,
    activeLabel: activeAddress ? shortenAddress(activeAddress) : null,
    errorMessage,
    canUseExtension,
    connect,
    disconnect,
    setActiveAddress
  };
}

