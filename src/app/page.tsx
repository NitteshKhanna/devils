"use client";
import "./page.scss";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { useNFTs } from "@/hooks/useNFTs";
import { NFT } from "@/types";

export default function Home() {
  const { connected, publicKey, wallets, select, connect } = useWallet();
  const { nfts, loading, lockedMints, refetch } = useNFTs();

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [connectWalletClicked, setConnectWalletClicked] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-advance when wallet connects, reset when it disconnects
  useEffect(() => {
    if (connected && step === 0) setStep(1);
    if (!connected && step > 0) {
      setStep(0);
    }
  }, [connected, step]);

  return (
    <main>
      <div className="tabContainer flex">
        {/* ── Step 0: Connect Wallet ── */}
        <div className={`tab tab1 flex ${step === 0 ? "" : "hidden"}`}>
          <h1>🔗</h1>
          <h2>Connect Your Wallet</h2>
          <h3 className="helvetica">
            Link a Solana-compatible wallet to view your NFT upgrade status
          </h3>
          <button
            className={`blueGradBG connectWalletButton ${connectWalletClicked ? "hidden" : ""}`}
            onClick={() => {
              setConnectWalletClicked(true);
            }}
          >
            Connect Wallet
          </button>
          <div
            className={`walletList flex ${connectWalletClicked ? "" : "hidden"}`}
          >
            {!mounted ? (
              <p className="noWallet helvetica">Detecting wallets…</p>
            ) : (
              <>
                {wallets
                  .filter((w) => w.readyState === "Installed" || w.readyState === "Loadable")
                  .map((wallet) => (
                    <button
                      key={wallet.adapter.name}
                      className="walletOption flex"
                      onClick={() => {
                        select(wallet.adapter.name as WalletName);
                        setTimeout(async () => {
                          try {
                            await connect();
                          } catch (err) {
                            console.error("Connection error:", err);
                          }
                        }, 300);
                      }}
                    >
                      {wallet.adapter.icon && (
                        <img
                          src={wallet.adapter.icon}
                          alt={wallet.adapter.name}
                          className="walletIcon"
                        />
                      )}
                      <span>
                        {wallet.adapter.name}{" "}
                        {wallet.readyState === "Installed"
                          ? "detected — click to connect"
                          : "— tap to open"}
                      </span>
                    </button>
                  ))}
                {wallets.filter(
                  (w) => w.readyState === "Installed" || w.readyState === "Loadable"
                ).length === 0 && (
                  <p className="noWallet helvetica">
                    No wallet detected. Please install a Solana wallet like{" "}
                    <a
                      href="https://phantom.app"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Phantom
                    </a>{" "}
                    to continue.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Step 1: View NFT Upgrade Status ── */}
        <div className={`tab tab2 flex ${step === 1 ? "" : "hidden"}`}>
          <h2>Your NFT Collection</h2>
          <h3 className="helvetica">
            View your NFT collection and upgrade status
          </h3>
          {loading ? (
            <div className="loadingState flex">
              <div className="spinner"></div>
              <span>Loading your NFTs…</span>
            </div>
          ) : nfts.length === 0 ? (
            <div className="emptyState flex">
              <span>No collection NFTs found in your wallet.</span>
            </div>
          ) : (
            <div className="nftGrid flex">
              {nfts.map((nft) => {
                const isLocked = lockedMints.has(nft.mint);
                return (
                  <div
                    key={nft.mint}
                    className="nftCard flex"
                  >
                    <div className="nftCardBoderBox flex">
                      {isLocked && (
                        <div className="lockBadge flex">
                          🔒 Upgrade pending
                        </div>
                      )}
                      <img
                        src={nft.image || "/images/nftPlaceholder.png"}
                        alt={nft.name}
                      />
                      <span className="nftName">{nft.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}