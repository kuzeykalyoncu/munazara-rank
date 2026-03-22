import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from 'next/link';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Münazara Rank | ELO Tracker",
  description:
    "Türk akademik münazara dünyasının ELO sıralama sistemi ve istatistik takip platformu.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <nav className="border-b border-white/10 bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/30">
                  M
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  MünazaraRank
                </span>
              </Link>
              <div className="flex items-center gap-6">
                <Link
                  href="/"
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
          MünazaraRank © {new Date().getFullYear()} — Türk Münazara Topluluğu
          için yapıldı
        </footer>
      </body>
    </html>
  );
}
