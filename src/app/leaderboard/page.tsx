"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Speaker } from "@/lib/supabase";

function EloBadge({ elo }: { elo: number }) {
  let cls = "text-gray-400 bg-gray-500/10 border-gray-600/40";
  let label = "Başlangıç";
  if (elo > 2000)      { cls = "text-yellow-300 bg-yellow-500/15 border-yellow-500/30"; label = "Şampiyon"; }
  else if (elo >= 1700) { cls = "text-violet-400 bg-violet-500/15 border-violet-500/30"; label = "Uzman"; }
  else if (elo >= 1400) { cls = "text-indigo-400 bg-indigo-500/15 border-indigo-500/30"; label = "Avantajlı"; }
  else if (elo >= 1200) { cls = "text-green-400 bg-green-500/15 border-green-500/30"; label = "Yükselen"; }
  else if (elo >= 1000) { cls = "text-blue-400 bg-blue-500/15 border-blue-500/30"; label = "Standart"; }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {label}
    </span>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-gray-500 font-mono text-sm w-6 text-center">{rank}</span>;
}

function SpeakerRow({ sp, rank, isUnranked = false, sortBy = "current" }: { sp: Speaker; rank?: number; isUnranked?: boolean; sortBy?: "current" | "peak" }) {
  const avatarBg = isUnranked
    ? "bg-gradient-to-br from-gray-600 to-gray-700"
    : "bg-gradient-to-br from-indigo-500 to-violet-600 shadow shadow-indigo-500/30";
  const eloToDisplay = sortBy === "peak" ? (sp.peak_elo ?? 1000) : sp.elo;
  return (
    <tr className={`border-b border-white/5 hover:bg-white/5 transition group ${isUnranked ? "opacity-60" : ""}`}>
      <td className="px-6 py-4">
        <div className="flex items-center justify-center">
          {isUnranked
            ? <span className="text-xs text-gray-600 font-mono border border-gray-700 rounded px-1.5 py-0.5">—</span>
            : <RankMedal rank={rank!} />}
        </div>
      </td>
      <td className="px-6 py-4">
        <Link href={`/speakers/${sp.id}`} className="flex items-center gap-3 hover:text-indigo-400 transition">
          <div className={`w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
            {sp.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className={`font-medium group-hover:text-indigo-400 transition ${isUnranked ? "text-gray-300" : "text-white"}`}>{sp.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {isUnranked ? (
                <span className="text-xs px-2 py-0.5 rounded-full border font-medium text-gray-500 bg-gray-500/10 border-gray-600/40">Unranked</span>
              ) : (
                <EloBadge elo={eloToDisplay} />
              )}
              {sortBy === "peak" && sp.peak_elo_tournament && (
                <span className="text-xs text-indigo-400/90 font-medium flex items-center gap-1">
                  <span>🏆</span>
                  <span>{sp.peak_elo_tournament}</span>
                </span>
              )}
            </div>
          </div>
        </Link>
      </td>
      <td className="px-6 py-4 text-right">
        <span className={`font-bold font-mono ${isUnranked ? "text-lg text-gray-400" : "text-xl text-white"}`}>{eloToDisplay}</span>
      </td>
      <td className={`px-6 py-4 text-right hidden md:table-cell ${isUnranked ? "text-gray-500" : "text-gray-400"}`}>{sp.total_tournaments}</td>
      <td className={`px-6 py-4 text-right hidden md:table-cell ${isUnranked ? "text-gray-500" : "text-gray-400"}`}>{sp.career_avg_speak?.toFixed(1) ?? "—"}</td>
    </tr>
  );
}

const UNRANKED_MIN_TOURNAMENTS = 4; // 4. turnuvadan itibaren Ranked

export default function LeaderboardPage() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"current" | "peak">("current");

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => { setSpeakers(d.speakers || []); setLoading(false); });
  }, []);

  // Normalize Turkish characters for case-insensitive and keyboard-friendly search
  const cleanForSearch = (str: string) => {
    return str
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u")
      .replace(/ç/g, "c")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g");
  };

  // Filter based on search query
  const filtered = speakers.filter((s) =>
    cleanForSearch(s.name).includes(cleanForSearch(search))
  );

  // Sort according to current or peak ELO
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (sortBy === "peak") {
      const peakA = a.peak_elo ?? 1000;
      const peakB = b.peak_elo ?? 1000;
      return peakB - peakA;
    }
    return b.elo - a.elo;
  });

  // Split into Ranked vs Unranked
  const rankedFiltered = sortedFiltered.filter(s => (s.total_tournaments ?? 0) >= UNRANKED_MIN_TOURNAMENTS || s.force_ranked);
  const unrankedFiltered = sortedFiltered.filter(s => (s.total_tournaments ?? 0) < UNRANKED_MIN_TOURNAMENTS && !s.force_ranked);

  // For global ranked speakers list (to calculate absolute rank correctly)
  const globalRankedSpeakers = [...speakers]
    .filter(s => (s.total_tournaments ?? 0) >= UNRANKED_MIN_TOURNAMENTS || s.force_ranked)
    .sort((a, b) => {
      if (sortBy === "peak") {
        return (b.peak_elo ?? 1000) - (a.peak_elo ?? 1000);
      }
      return b.elo - a.elo;
    });

  const maxEloDisplay = speakers.length > 0
    ? (sortBy === "peak" 
        ? Math.max(...speakers.map(s => s.peak_elo ?? 1000)) 
        : (speakers[0]?.elo ?? 1000))
    : "—";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-10">
        <h1 className="text-5xl font-extrabold text-gradient mb-3">
          MünazaRank
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Türk akademik münazara dünyasının resmi ELO sıralama sistemi
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Toplam Konuşmacı", value: speakers.length, icon: "🎙️" },
          { label: sortBy === "peak" ? "En Yüksek Zirve ELO" : "En Yüksek ELO", value: maxEloDisplay, icon: "👑" },
          { label: "Ort. ELO", value: speakers.length ? Math.round(speakers.reduce((a, s) => a + (sortBy === "peak" ? (s.peak_elo ?? 1000) : s.elo), 0) / speakers.length) : "—", icon: "📊" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5 text-center">
            <div className="text-3xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-gray-400 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls: Segmented Sort Switcher & Search */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex bg-black/20 p-1.5 rounded-xl border border-white/5 self-start">
          <button
            onClick={() => setSortBy("current")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              sortBy === "current"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                : "text-gray-400 hover:text-white"
            }`}
          >
            📈 Güncel ELO
          </button>
          <button
            onClick={() => setSortBy("peak")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              sortBy === "peak"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                : "text-gray-400 hover:text-white"
            }`}
          >
            👑 Zirve ELO (Peak)
          </button>
        </div>
        <div className="relative flex-1 md:max-w-xs">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Konuşmacı ara..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-10 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400">Leaderboard yükleniyor...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-gray-500">
            {search ? `"${search}" için sonuç bulunamadı.` : "Henüz veri yok. Admin panelinden turnuva ekleyin."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 text-left w-16">Sıra</th>
                <th className="px-6 py-4 text-left">Konuşmacı</th>
                <th className="px-6 py-4 text-right">{sortBy === "peak" ? "ZİRVE ELO" : "ELO"}</th>
                <th className="px-6 py-4 text-right hidden md:table-cell">Turnuva</th>
                <th className="px-6 py-4 text-right hidden md:table-cell">Ort. Speak</th>
              </tr>
            </thead>
            <tbody>
              {rankedFiltered.map((sp) => {
                const globalRank = globalRankedSpeakers.findIndex((s) => s.id === sp.id) + 1;
                return <SpeakerRow key={sp.id} sp={sp} rank={globalRank} sortBy={sortBy} />;
              })}
              {unrankedFiltered.length > 0 && (
                <>
                  <tr>
                    <td colSpan={5} className="px-6 py-3 border-t border-white/10 bg-white/2">
                      <span className="text-xs text-gray-600 uppercase tracking-widest font-medium">
                        Unranked (4 turnuva altı)
                      </span>
                    </td>
                  </tr>
                  {unrankedFiltered.map((sp) => (
                    <SpeakerRow key={sp.id} sp={sp} isUnranked={true} sortBy={sortBy} />
                  ))}
                </>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
