import { parseEther } from "ethers";

const CHAIN_ID_HEX = "0x190F1B46";
const CHAIN_ID_DEC = 420420422;
const RPC_URL = process.env.NEXT_PUBLIC_PASEO_RPC_URL || "https://testnet-passet-hub-eth-rpc.polkadot.io";
const EXPLORER = "https://blockscout-passet-hub.parity-testnet.parity.io";

function toHexWei(amount: number) {
  const wei = BigInt(parseEther(amount.toString()).toString());
  return "0x" + wei.toString(16);
}

async function ensureNetwork(ethereum: any) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: "Polkadot Hub TestNet",
            rpcUrls: [RPC_URL],
            nativeCurrency: { name: "Paseo", symbol: "PAS", decimals: 18 },
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } else {
      throw err;
    }
  }
}

export async function sendPasTxViaMetamask({
  to,
  amount,
  from,
}: {
  to: string;
  amount: number;
  from?: string;
}) {
  if (typeof window === "undefined") throw new Error("需要在浏览器环境使用 MetaMask。");
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error("未检测到 MetaMask。");
  await ensureNetwork(ethereum);
  const accounts: string[] = await ethereum.request({
    method: "eth_requestAccounts",
  });
  const sender = from || accounts?.[0];
  if (!sender) throw new Error("未获取到账户，请在 MetaMask 中解锁钱包。");

  const txHash: string = await ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: sender,
        to,
        value: toHexWei(amount),
        chainId: CHAIN_ID_HEX,
      },
    ],
  });

  return {
    hash: txHash,
    explorer: `${EXPLORER}/tx/${txHash}`,
    chainId: CHAIN_ID_DEC,
  };
}
