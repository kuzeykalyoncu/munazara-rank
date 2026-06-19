import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from 'next/link';
import Script from 'next/script';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MünazaRank | ELO Tracker",
  description:
    "Türk akademik münazara dünyasının ELO sıralama sistemi ve istatistik takip platformu.",
  other: {
    "google-adsense-account": "ca-pub-6948290996459258",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="tr" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        {/* Google AdSense */}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6948290996459258"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        )}
        <nav className="border-b border-white/10 bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/30">
                  M
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  MünazaRank
                </span>
              </Link>
              <div className="flex items-center gap-6">
                <Link
                  href="/leaderboard"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Leaderboard
                </Link>
                <Link
                  href="/stats"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  İstatistikler
                </Link>
                <Link
                  href="/mechanics"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Hesaplama Şekli
                </Link>
                <Link
                  href="/admin"
                  className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/40 hover:text-indigo-300 transition-all"
                >
                  Admin
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-white/5 mt-16 py-8 text-center text-gray-600 text-sm">
          MünazaRank © {new Date().getFullYear()} — Türk Münazara Topluluğu
          için yapıldı
        </footer>
      </body>
    </html>
  );
}
