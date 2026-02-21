'use client';

import { FC, ReactNode, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { SolanaMobileWalletAdapter, createDefaultAddressSelector, createDefaultAuthorizationResultCache, createDefaultWalletNotFoundHandler } from '@solana-mobile/wallet-adapter-mobile';

// import '@solana/wallet-adapter-react-ui/styles.css';

interface Props {
  children: ReactNode;
}

export const WalletProvider: FC<Props> = ({ children }) => {
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'devnet' | 'mainnet-beta') || 'devnet';

  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_RPC_ENDPOINT || clusterApiUrl(network),
    [network]
  );

  const wallets = useMemo(
    () => [
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: { name: 'De Evils Burn' },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: network === 'mainnet-beta' ? 'mainnet-beta' : 'devnet',
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};

export default WalletProvider;
