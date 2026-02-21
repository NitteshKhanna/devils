# De Evils Burn - Secure NFT Burning Platform

A secure Next.js application for burning Solana NFTs with on-chain verification and reliable record-keeping.

## Security Features

- **On-chain Verification**: All burns are verified on the Solana blockchain
- **Transaction Confirmation**: Waits for confirmed commitment before recording
- **Duplicate Prevention**: Prevents double-recording of burns
- **Atomic Operations**: File-based locking prevents race conditions
- **API Security**: Protected endpoints with secret validation
- **Network Resilience**: Retry logic for network failures
- **Wallet Verification**: Confirms wallet signatures before processing

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file:
```bash
cp .env.local.example .env.local
```

3. Edit `.env.local` and set:
   - `NEXT_PUBLIC_SOLANA_NETWORK` (devnet or mainnet-beta)
   - `BURN_API_SECRET` (generate a strong random secret)
   - Optional: `NEXT_PUBLIC_COLLECTION_ADDRESS` to filter specific collection

4. Run development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## How It Works

1. User connects Solana wallet (Phantom, Solflare)
2. Application fetches all NFTs owned by the user
3. User selects an NFT to burn
4. Application sends burn transaction on-chain
5. After confirmation, burn is verified and recorded
6. User address and NFT metadata are stored securely

## Production Deployment

- Set `NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta`
- Use a secure, random `BURN_API_SECRET`
- Consider using a private RPC endpoint for reliability
- Back up the `data/` directory regularly
- Monitor error logs for failed transactions

## Data Storage

Burned NFT records are stored in `data/burnt-nfts.json`:
- User wallet address
- NFT mint address
- NFT name and image
- Burn transaction signature
- Timestamp

## License

MIT
