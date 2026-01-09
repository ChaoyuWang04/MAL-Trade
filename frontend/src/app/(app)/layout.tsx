import Link from "next/link";

import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";

export default function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-neutral-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-semibold">
              MAL Agents
            </Link>
            <nav className="hidden items-center gap-4 text-sm text-white/70 sm:flex">
              <Link className="hover:text-white" href="/dashboard">
                Dashboard
              </Link>
              <Link className="hover:text-white" href="/create">
                Create
              </Link>
              <Link className="hover:text-white" href="/interact">
                Interact
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <WalletConnectButton />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}

