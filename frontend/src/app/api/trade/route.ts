import { NextRequest, NextResponse } from "next/server";
import { JsonRpcProvider, Wallet, isAddress, parseEther } from "ethers";

export const runtime = "nodejs";

const DEFAULT_RPC_URL = "https://testnet-passet-hub-eth-rpc.polkadot.io";
const DEFAULT_EXCHANGE_WALLET = "0x000000000000000000000000000000000000dEaD";
const CHAIN_ID = 420_420_422;
const EXPLORER_BASE = "https://blockscout-passet-hub.parity-testnet.parity.io/tx/";

type TradeRequest = {
  action?: string;
  amount?: number;
  to?: string;
};

export async function POST(req: NextRequest) {
  let payload: TradeRequest;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = (payload.action || "").toUpperCase();
  if (action !== "BUY" && action !== "SELL") {
    return NextResponse.json({ error: "action must be BUY or SELL" }, { status: 400 });
  }

  const amount = typeof payload.amount === "number" && payload.amount > 0 ? payload.amount : 0.01;
  const rpcUrl = (process.env.PASEO_RPC_URL || DEFAULT_RPC_URL).trim();
  const privateKey = (process.env.PASEO_PRIVATE_KEY || "").trim();
  const to = (payload.to || process.env.PASEO_EXCHANGE_WALLET || DEFAULT_EXCHANGE_WALLET).trim();

  if (!privateKey) {
    return NextResponse.json({ error: "PASEO_PRIVATE_KEY is required" }, { status: 500 });
  }
  if (!isAddress(to)) {
    return NextResponse.json({ error: "Invalid target wallet address" }, { status: 400 });
  }

  const provider = new JsonRpcProvider(rpcUrl, { chainId: CHAIN_ID, name: "paseo-testnet" });
  const wallet = new Wallet(privateKey, provider);

  try {
    const tx = await wallet.sendTransaction({
      to,
      value: parseEther(amount.toString()),
    });

    return NextResponse.json({
      txHash: tx.hash,
      explorerUrl: `${EXPLORER_BASE}${tx.hash}`,
      amount,
      to,
    });
  } catch (err: any) {
    console.error("Paseo trade failed", err);
    return NextResponse.json(
      { error: err?.message || "Trade failed. Check gas and balance." },
      { status: 500 }
    );
  }
}
