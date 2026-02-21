"use client";
import "./page.scss";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { useNFTs } from "@/hooks/useNFTs";
import { useBurnNFT } from "@/hooks/useBurnNFT";
import { NFT } from "@/types";

export default function Home() {
  const { connected, publicKey, wallets, select, connect } = useWallet();
  const { nfts, loading, lockedMints, refetch } = useNFTs();
  const {
    burnMultipleNFTs,
    burning,
    status,
    error: burnError,
    progress,
    txSignatures,
  } = useBurnNFT();

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [burnSelections, setBurnSelections] = useState<NFT[]>([]);
  const [upgradeSelections, setUpgradeSelections] = useState<NFT[]>([]);
  const [burnComplete, setBurnComplete] = useState(false);
  const [connectWalletClicked, setConnectWalletClicked] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // NFTs available for burning (exclude those locked as upgrade targets)
  const burnableNFTs = nfts.filter((n) => !lockedMints.has(n.mint));
  const maxBurnCount = Math.floor(burnableNFTs.length / 2);
  const remainingNFTs = nfts.filter(
    (n) =>
      !burnSelections.some((b) => b.mint === n.mint) &&
      !lockedMints.has(n.mint),
  );

  // Auto-advance when wallet connects, reset when it disconnects
  useEffect(() => {
    if (connected && step === 0) setStep(1);
    if (!connected && step > 0 && !burning) {
      setStep(0);
      setBurnSelections([]);
      setUpgradeSelections([]);
      setBurnComplete(false);
    }
  }, [connected, step, burning]);

  const toggleBurnSelection = (nft: NFT) => {
    if (burning) return;
    if (lockedMints.has(nft.mint)) return; // server-side locked
    setBurnSelections((prev) => {
      const exists = prev.some((n) => n.mint === nft.mint);
      if (exists) return prev.filter((n) => n.mint !== nft.mint);
      if (prev.length >= maxBurnCount) return prev;
      return [...prev, nft];
    });
  };

  const toggleUpgradeSelection = (nft: NFT) => {
    if (burning) return;
    // Never allow selecting a burn-target as upgrade-target
    if (burnSelections.some((b) => b.mint === nft.mint)) return;
    setUpgradeSelections((prev) => {
      const exists = prev.some((n) => n.mint === nft.mint);
      if (exists) return prev.filter((n) => n.mint !== nft.mint);
      if (prev.length >= burnSelections.length) return prev;
      return [...prev, nft];
    });
  };

  const handleConfirm = async () => {
    const confirmed = window.confirm(
      `You are about to permanently burn ${burnSelections.length} NFT${burnSelections.length > 1 ? "s" : ""}. This action is IRREVERSIBLE.\n\nAre you sure you want to continue?`,
    );
    if (!confirmed) return;
    const result = await burnMultipleNFTs(burnSelections, upgradeSelections);
    if (result.success) {
      // setStep(step + 1);
      setBurnComplete(true);
    }
  };

  const handleStartOver = () => {
    setBurnSelections([]);
    setUpgradeSelections([]);
    setBurnComplete(false);
    setStep(1);
    refetch(); // reload NFTs + locked mints from chain & DB
  };

  const handleBack = () => {
    if (step === 2) {
      setUpgradeSelections([]);
      setStep(1);
    } else if (step === 3 && !burning && !burnComplete) {
      setStep(2);
    }
  };

  const steps = ["CONNECT", "BURN", "UPGRADE", "CONFIRM"];

  return (
    <main>
      {/* ── Progress Bar ── */}
      <div className="progressBarContainer flex">
        <div className="progressBar flex">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`progressStep flex ${i > step ? "inactive" : i === step && !burnComplete ? "current" : ""}`}
            >
              {i > 0 && <div className="progressConnector"></div>}
              <div className="step flex">
                <div className="stepNumber">
                  {i < step || burnComplete ? "✓" : i + 1}
                </div>
                <span className="stepLabel">{steps[i]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="tabContainer flex">
        {/* ── Step 0: Connect Wallet ── */}
        <div className={`tab tab1 flex ${step === 0 ? "" : "hidden"}`}>
          <h1>🔗</h1>
          <h2>Connect Your Wallet</h2>
          <h3 className="helvetica">
            Link a Solana-compatible wallet to verify ownership and begin
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

        {/* ── Step 1: Select NFTs to Burn ── */}
        <div className={`tab tab2 flex ${step === 1 ? "" : "hidden"}`}>
          <h2>Select NFTs to Burn</h2>
          <h3 className="helvetica">
            Choose up to <span className="red">{maxBurnCount}</span> NFTs. This
            action is <span className="red">permanent and irreversible.</span>
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
            <>
              <div className="selectionCount">
                {burnSelections.length} / {maxBurnCount} selected
              </div>
              <div className="nftGrid flex">
                {nfts.map((nft) => {
                  const isLocked = lockedMints.has(nft.mint);
                  const isSelected = burnSelections.some(
                    (n) => n.mint === nft.mint,
                  );
                  const isFull =
                    isLocked ||
                    (!isSelected && burnSelections.length >= maxBurnCount);
                  return (
                    <div
                      key={nft.mint}
                      className={`nftCard flex ${isSelected ? "toBurn" : ""} ${isFull ? "full" : ""}`}
                      onClick={() => !isFull && toggleBurnSelection(nft)}
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
              <button
                className={`burnGradBG burnButton ${burnSelections.length === 0 ? "hidden" : ""}`}
                onClick={() => setStep(2)}
              >
                Burn
              </button>
            </>
          )}
        </div>

        {/* ── Step 2: Select NFTs to Upgrade ── */}
        <div className={`tab tab3 flex ${step === 2 ? "" : "hidden"}`}>
          <h2>Select NFTs to Upgrade</h2>
          <h3 className="helvetica">
            Choose <span className="highlight">{burnSelections.length}</span>{" "}
            NFTs from your remaining collection to upgrade.
          </h3>
          <div className="selectionCount">
            {upgradeSelections.length} / {burnSelections.length} selected
          </div>
          <div className="nftGrid flex">
            {remainingNFTs.map((nft) => {
              const isSelected = upgradeSelections.some(
                (n) => n.mint === nft.mint,
              );
              const isFull =
                !isSelected &&
                upgradeSelections.length >= burnSelections.length;
              return (
                <div
                  key={nft.mint}
                  className={`nftCard flex ${isSelected ? "toUpgrade" : ""} ${isFull ? "full" : ""}`}
                  onClick={() => !isFull && toggleUpgradeSelection(nft)}
                >
                  <div className="nftCardBoderBox flex">
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
          {/* <button className="backButton" onClick={handleBack}>
            ← Back
          </button> */}
          <button
            className={`upgradeGradBG upgradeButton ${upgradeSelections.length !== burnSelections.length ? "hidden" : ""}`}
            onClick={() => setStep(3)}
          >
            Upgrade
          </button>
        </div>

        {/* ── Step 3: Confirm & Execute ── */}
        <div className={`tab tab4 flex ${step === 3 ? "" : "hidden"}`}>
          {burnComplete ? (
            <>
              <h1>✓</h1>
              <h2>Upgrade Recorded</h2>
              <h3 className="helvetica">
                Your selections have been saved. The team will apply upgrades
                offline.
              </h3>
              <div className="NFTSummaryBox flex">
                <h3 className="title">UPGRADE SUMMARY</h3>
                <span className="NFTSummaryLine flex">
                  <h3>Wallet</h3>
                  <h3 className="gray">
                    {publicKey
                      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-6)}`
                      : "—"}
                  </h3>
                </span>
                {burnSelections.map((nft, i) => (
                  <span key={nft.mint} className="NFTSummaryLine flex">
                    <h3>
                      Burned NFT {burnSelections.length > 1 ? `#${i + 1}` : ""}
                    </h3>
                    <h3 className="red">{nft.name}</h3>
                  </span>
                ))}
                {upgradeSelections.map((nft, i) => (
                  <span key={nft.mint} className="NFTSummaryLine flex">
                    <h3>
                      Upgrade Target{" "}
                      {upgradeSelections.length > 1 ? `#${i + 1}` : ""}
                    </h3>
                    <h3 className="violet">{nft.name}</h3>
                  </span>
                ))}
                <span className="NFTSummaryLine flex">
                  <h3>Timestamp</h3>
                  <h3 className="gray">{new Date().toLocaleString()}</h3>
                </span>
              </div>
            </>
          ) : (
            <>
              <h2>Review & Confirm</h2>
              <h3 className="helvetica">
                Review your selections below. This action is{" "}
                <span className="red">permanent and irreversible.</span>
              </h3>

              {burning && (
                <div className="burnProgress flex">
                  <div className="spinner"></div>
                  <span>{status}</span>
                  {progress.total > 0 && (
                    <div className="progressBarSmall">
                      <div
                        className="progressFill"
                        style={{
                          width: `${(progress.current / progress.total) * 100}%`,
                        }}
                      ></div>
                    </div>
                  )}
                </div>
              )}

              {burnError && (
                <div className="errorBox flex">
                  <span>⚠️ {burnError}</span>
                  {txSignatures.length > 0 && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        wordBreak: "break-all",
                        marginTop: "0.5rem",
                        color: "#888",
                      }}
                    >
                      Transaction IDs: {txSignatures.join(", ")}
                    </span>
                  )}
                </div>
              )}

              <div className="reviewColumns flex">
                <div className="reviewListBox burnList flex">
                  <h3 className="listTitle red">
                    🔥 NFTs to Burn ({burnSelections.length})
                  </h3>
                  <div className="reviewGrid flex">
                    {burnSelections.map((nft) => (
                      <div key={nft.mint} className="reviewCard toBurn flex">
                        <div className="reviewCardBorderContainer flex">
                          <img
                            src={nft.image || "/images/nftPlaceholder.png"}
                            alt={nft.name}
                          />
                          <span className="reviewCardName">{nft.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="reviewListBox upgradeList flex">
                  <h3 className="listTitle violet">
                    ⬆ NFTs to Upgrade ({upgradeSelections.length})
                  </h3>
                  <div className="reviewGrid flex">
                    {upgradeSelections.map((nft) => (
                      <div key={nft.mint} className="reviewCard toUpgrade flex">
                        <div className="reviewCardBorderContainer flex">
                          <img
                            src={nft.image || "/images/nftPlaceholder.png"}
                            alt={nft.name}
                          />
                          <span className="reviewCardName">{nft.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {!burning && (
                <div className="navButtons flex">
                  <button
                    className="backButton"
                    onClick={handleBack}
                    disabled={burning}
                  >
                    ← Back
                  </button>
                  <button
                    className="confirmButton"
                    onClick={handleConfirm}
                    disabled={burning}
                  >
                    {burning ? "Burning…" : "🔥 Confirm & Burn"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
