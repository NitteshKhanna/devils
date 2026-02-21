"use client";
import Link from "next/link";
import "./header.scss";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";

export default function Header() {
  const { connected, publicKey, select, wallets, connect } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleSelectWallet = async (walletName: string) => {
    try {
      select(walletName as WalletName);
      setShowModal(false);
      // Give the wallet adapter a moment to update before connecting
      setTimeout(async () => {
        try {
          await connect();
        } catch (error) {
          console.error("Connection error:", error);
        }
      }, 300);
    } catch (error) {
      console.error("Wallet selection error:", error);
    }
  };

  const handleConnect = () => {
    setShowModal(true);
  };

  if (!mounted) {
    return (
      <header className="header flex">
        <Link href="/" className="logoLink flex">
          <img className="logo" src="/images/logo.svg" alt="" />
          <h1 className="title">
            <div>Devils</div>
            <div className="tagline">Upgrade Portal · Solana</div>
          </h1>
        </Link>
        <button className="wallet-button" disabled>
          Loading...
        </button>
      </header>
    );
  }

  return (
    <>
      <header className="header flex">
        <Link href="/" className="logoLink flex">
          <img className="logo" src="/images/logo.svg" alt="" />
          <h1 className="title">
            <div>Devils</div>
            <div className="tagline">Upgrade Portal · Solana</div>
          </h1>
        </Link>

        {connected && publicKey ? (
          <div className="wallet-address-container">
            <div className="wallet-status-indicator"></div>
            <span className="wallet-address">
              {truncateAddress(publicKey.toBase58())}
            </span>
          </div>
        ) : (
          <div className="wallet-address-container">
            <div className="wallet-status-indicator disconnected"></div>
            <span className="wallet-status-text">Wallet not connected</span>
          </div>
        )}
      </header>

      {/* Custom Wallet Modal */}
      {mounted && showModal && (
        <div className="wallet-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wallet-modal-header">
              <h2>Select Wallet</h2>
              <button 
                className="wallet-modal-close"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="wallet-modal-list">
              {wallets
                .filter((w) => w.readyState === "Installed")
                .map((wallet) => (
                  <button
                    key={wallet.adapter.name}
                    className="wallet-modal-item"
                    onClick={() => handleSelectWallet(wallet.adapter.name)}
                  >
                    {wallet.adapter.icon && (
                      <img 
                        src={wallet.adapter.icon} 
                        alt={wallet.adapter.name}
                        className="wallet-modal-icon"
                      />
                    )}
                    <span>{wallet.adapter.name}</span>
                  </button>
                ))}
            </div>

            {/* Show unavailable wallets */}
            {wallets.some((w) => w.readyState !== "Installed") && (
              <>
                <div className="wallet-modal-divider">Not installed</div>
                <div className="wallet-modal-list">
                  {wallets
                    .filter((w) => w.readyState !== "Installed")
                    .map((wallet) => (
                      <a
                        key={wallet.adapter.name}
                        href={wallet.adapter.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="wallet-modal-item disabled"
                      >
                        {wallet.adapter.icon && (
                          <img 
                            src={wallet.adapter.icon} 
                            alt={wallet.adapter.name}
                            className="wallet-modal-icon"
                          />
                        )}
                        <span>{wallet.adapter.name}</span>
                      </a>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}