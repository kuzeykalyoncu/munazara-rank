import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/40 mb-4">
          <span className="text-4xl font-extrabold text-white">M</span>
        </div>
        <h1 className="text-5xl font-extrabold text-white tracking-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
            MünazaRank
          </span>
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto leading-relaxed">
          Türk akademik münazara dünyasının ELO sıralama sistemi ve
          istatistik takip platformu.
        </p>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl px-4">
        <Link
          href="/leaderboard"
          className="group relative flex flex-col glass p-8 rounded-3xl hover:-translate-y-1 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20 border border-white/5 hover:border-indigo-500/30 overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="text-8xl">🏆</span>
          </div>
          <span className="text-3xl mb-4">🏆</span>
          <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">
            Leaderboard
          </h2>
          <p className="text-gray-400 text-sm">
            Türkiye&apos;nin tartışmacılarını güncel ELO puanlarına göre incele.
            Sıralamadaki yerini gör.
          </p>
        </Link>

        <Link
          href="/stats"
          className="group relative flex flex-col glass p-8 rounded-3xl hover:-translate-y-1 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/20 border border-white/5 hover:border-purple-500/30 overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="text-8xl">📊</span>
          </div>
          <span className="text-3xl mb-4">📊</span>
          <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">
            İstatistikler
          </h2>
          <p className="text-gray-400 text-sm">
            Topluluğun ELO çan eğrisi, en yüksek kazanma oranları ve
            ortalama konuşmacı puanlarını incele.
          </p>
        </Link>

        <Link
          href="/mechanics"
          className="group relative flex flex-col glass p-8 rounded-3xl hover:-translate-y-1 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/20 border border-white/5 hover:border-cyan-500/30 overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="text-8xl">⚙️</span>
          </div>
          <span className="text-3xl mb-4">⚙️</span>
          <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">
            Hesaplama Şekli
          </h2>
          <p className="text-gray-400 text-sm">
            MünazaRank sisteminin ELO dağılımını, K-faktörlerini ve
            matematiksel hesaplama adımlarını öğren.
          </p>
        </Link>

        <Link
          href="/admin"
          className="group relative flex flex-col glass p-8 rounded-3xl hover:-translate-y-1 transition-all duration-300 hover:shadow-xl hover:shadow-rose-500/20 border border-white/5 hover:border-rose-500/30 overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="text-8xl">🔒</span>
          </div>
          <span className="text-3xl mb-4">🔒</span>
          <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-rose-400 transition-colors">
            Admin Paneli
          </h2>
          <p className="text-gray-400 text-sm">
            Turnuva ekle, eşleştirmeleri yönet ve toplu analiz işlemlerini
            gerçekleştir. (Giriş gerektirir)
          </p>
        </Link>
      </div>
    </div>
  );
}
