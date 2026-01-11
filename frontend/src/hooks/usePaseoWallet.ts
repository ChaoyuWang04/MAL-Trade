import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, isAddress, parseEther } from "ethers";
import { useStore } from "@/store";

const PASEO_CHAIN_ID_DEC = 420420422;
const PASEO_CHAIN_ID_HEX = "0x190F1B46";
const PASEO_RPC_URL = process.env.NEXT_PUBLIC_PASEO_RPC_URL || "https://testnet-passet-hub-eth-rpc.polkadot.io";
const PASEO_EXPLORER = "https://blockscout-passet-hub.parity-testnet.parity.io";
const DEFAULT_EXCHANGE_WALLET =
  process.env.NEXT_PUBLIC_PASEO_EXCHANGE_WALLET ||
  "0x000000000000000000000000000000000000dEaD";

type WalletState = {
  address?: string;
  chainId?: number;
  balance?: string;
  isCorrectNetwork: boolean;
  lastTxHash?: string;
  lastExplorerUrl?: string;
  status?: string;
  error?: string | null;
};

export function usePaseoWallet() {
  const [state, setState] = useState<WalletState>({ isCorrectNetwork: false, error: null });
  const setOnChain = useStore((s) => s.setOnChain);

  const ethereum = useMemo(() => {
    if (typeof window === "undefined") return null;
    return (window as any).ethereum ?? null;
  }, []);

  const refreshBalance = useCallback(
    async (addr: string) => {
      if (!ethereum) return;
      try {
        const provider = new BrowserProvider(ethereum);
        const bal = await provider.getBalance(addr);
        setState((s) => ({ ...s, balance: bal ? (Number(bal) / 1e18).toFixed(4) : undefined }));
      } catch {
        // ignore balance errors
      }
    },
    [ethereum]
  );

  const ensureNetwork = useCallback(async () => {
    if (!ethereum) throw new Error("MetaMask 未检测到。请安装或启用扩展。");
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: PASEO_CHAIN_ID_HEX }],
      });
    } catch (err: any) {
      if (err?.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: PASEO_CHAIN_ID_HEX,
              chainName: "Polkadot Hub TestNet",
              rpcUrls: [PASEO_RPC_URL],
              nativeCurrency: { name: "Paseo", symbol: "PAS", decimals: 18 },
              blockExplorerUrls: [PASEO_EXPLORER],
            },
          ],
        });
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: PASEO_CHAIN_ID_HEX }],
        });
      } else {
        throw err;
      }
    }
  }, [ethereum]);

  const connect = useCallback(async () => {
    if (!ethereum) {
      setState((s) => ({ ...s, error: "未检测到 MetaMask。请先安装或打开。" }));
      return;
    }
    setState((s) => ({ ...s, status: "连接中...", error: null }));
    try {
      await ensureNetwork();
      const accounts: string[] = await ethereum.request({ method: "eth_requestAccounts" });
      const addr = accounts?.[0];
      if (!addr) throw new Error("未获取到账户");
      const provider = new BrowserProvider(ethereum);
      const network = await provider.getNetwork();
      const chainIdNum = Number(network.chainId);
      setState({
        address: addr,
        chainId: chainIdNum,
        isCorrectNetwork: chainIdNum === PASEO_CHAIN_ID_DEC,
        balance: undefined,
        lastTxHash: undefined,
        lastExplorerUrl: undefined,
        status: "已连接",
        error: null,
      });
      setOnChain({ wallet: addr });
      refreshBalance(addr);
    } catch (err: any) {
      setState((s) => ({ ...s, error: err?.message || "连接失败", status: undefined }));
    }
  }, [ensureNetwork, ethereum, refreshBalance, setOnChain]);

  const disconnect = useCallback(() => {
    setState({ isCorrectNetwork: false, error: null });
    setOnChain({ wallet: undefined, autoSendLlm: false });
  }, [setOnChain]);

  const sendPasTx = useCallback(
    async ({
      action,
      amount = 0.01,
      to = DEFAULT_EXCHANGE_WALLET,
    }: {
      action: "BUY" | "SELL";
      amount?: number;
      to?: string;
    }) => {
      if (!ethereum) throw new Error("未检测到 MetaMask。");
      if (!state.address) throw new Error("请先连接钱包。");
      if (!isAddress(to)) throw new Error("收款地址无效");
      await ensureNetwork();
      const provider = new BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const balance = await provider.getBalance(state.address);
      const needed = parseEther(amount.toString());
      if (balance < needed) {
        throw new Error("PAS 余额不足，请先去 Faucet 领取测试币。");
      }
      try {
        const tx = await signer.sendTransaction({
          to,
          value: parseEther(amount.toString()),
        });
        setState((s) => ({
          ...s,
          lastTxHash: tx.hash,
          lastExplorerUrl: `${PASEO_EXPLORER}/tx/${tx.hash}`,
        }));
        return { hash: tx.hash, explorer: `${PASEO_EXPLORER}/tx/${tx.hash}` };
      } catch (err: any) {
        if (err?.code === 4001) {
          throw new Error("用户拒绝了签名");
        }
        if (String(err?.message || "").includes("insufficient funds")) {
          throw new Error("余额不足，请先领取 PAS 测试币。");
        }
        throw new Error(err?.message || "交易失败");
      }
    },
    [ensureNetwork, ethereum, state.address]
  );

  useEffect(() => {
    if (!ethereum) return;
    const handleAccounts = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setState({ isCorrectNetwork: false, error: null });
        setOnChain({ wallet: undefined });
        return;
      }
      const addr = accounts[0];
      setState((s) => ({ ...s, address: addr, error: null }));
      setOnChain({ wallet: addr });
      refreshBalance(addr);
    };
    const handleChain = (chainIdHex: string) => {
      const dec = parseInt(chainIdHex, 16);
      setState((s) => ({ ...s, chainId: dec, isCorrectNetwork: dec === PASEO_CHAIN_ID_DEC }));
    };
    ethereum.on?.("accountsChanged", handleAccounts);
    ethereum.on?.("chainChanged", handleChain);
    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccounts);
      ethereum.removeListener?.("chainChanged", handleChain);
    };
  }, [ethereum, refreshBalance, setOnChain]);

  return {
    ...state,
    connect,
    disconnect,
    sendPasTx,
    isConnected: Boolean(state.address),
    defaultTo: DEFAULT_EXCHANGE_WALLET,
    faucetUrl: "https://faucet.polkadot.io/",
  };
}
