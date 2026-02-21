import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.scss";
import { WalletProvider } from "@/components/WalletProvider";
import Header from "@/components/header/header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Devils",
  description: "Sacrifice your De Evils NFT on-chain to unleash your next-form Devils NFT.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletProvider>
          <Header/>
          {children}
          <div className="bgRedBlackHole"></div>
        </WalletProvider>
      </body>
    </html>
  );
}
