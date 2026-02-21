// NFT Type
export interface NFT {
  mint: string;
  name: string;
  image: string;
  description?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}

// Burnt NFT Record (stored in MongoDB)
export interface BurntNFT {
  mint: string;
  name: string;
  burntBy: string;
  transactionSignature: string;
  burntAt: string;
  // Upgrade target linked to this burn
  upgradeTargetMint?: string;
  upgradeTargetName?: string;
}

// ── Batch burn + upgrade API ──
export interface BurnBatchRequest {
  walletAddress: string;
  burns: Array<{
    mintAddress: string;
    transactionSignature: string;
    name: string;
  }>;
  upgrades: Array<{
    burnedMint: string;
    upgradeMint: string;
    upgradeName: string;
  }>;
}

export interface BurnBatchResponse {
  success: boolean;
  message?: string;
  error?: string;
  recorded?: number;
}
