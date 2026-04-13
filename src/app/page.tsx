"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Speaker } from "@/lib/supabase";

function EloBadge({ elo }: { elo: number }) {
  let cls = "text-gray-400 bg-gray-500/10 border-gray-600/40";
  let label = "Başlangıç";
  if (elo >= 1300) { cls = "text-yellow-300 bg-yellow-500/15 border-yellow-500/30"; label = "Efsane"; }
  else if (elo >= 1200) { cls = "text-violet-400 bg-violet-500/15 border-violet-500/30"; label = "Grandmaster"; }
  else if (elo >= 1100) { cls = "text-indigo-400 bg-indigo-500/15 border-indigo-500/30"; label = "Master"; }
  else if (elo >= 1050) { cls = "text-green-400 bg-green-500/15 border-green-500/30"; label = "Uzman"; }
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

function SpeakerRow({ sp, rank, isUnranked = false }: { sp: Speaker; rank?: number; isUnranked?: boolean }) {
  const avatarBg = isUnranked
    ? "bg-gradient-to-br from-gray-600 to-gray-700"
    : "bg-gradient-to-br from-indigo-500 to-violet-600 shadow shadow-indigo-500/30";
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
            <div className="mt-0.5">
              {isUnranked
                ? <span className="text-xs px-2 py-0.5 rounded-full border font-medium text-gray-500 bg-gray-500/10 border-gray-600/40">Unranked</span>
                : <EloBadge elo={sp.elo} />}
            </div>
          </div>
        </Link>
      </td>
      <td className="px-6 py-4 text-right">
        <span className={`font-bold font-mono ${isUnranked ? "text-lg text-gray-400" : "text-xl text-white"}`}>{sp.elo}</span>
      </td>
      <td className={`px-6 py-4 text-right hidden md:table-cell ${isUnranked ? "text-gray-500" : "text-gray-400"}`}>{sp.total_tournaments}</td>
      <td className={`px-6 py-4 text-right hidden md:table-cell ${isUnranked ? "text-gray-500" : "text-gray-400"}`}>{sp.career_avg_speak?.toFixed(1) ?? "—"}</td>
      <td className="px-6 py-4 text-right hidden lg:table-cell">
        <span className={isUnranked ? "text-gray-500" : sp.win_rate >= 60 ? "text-green-400" : sp.win_rate >= 40 ? "text-yellow-400" : "text-gray-400"}>
          {sp.win_rate ? sp.win_rate.toFixed(0) + "%" : "—"}
        </span>
      </td>
    </tr>
  );
}

const UNRANKED_MIN_TOURNAMENTS = 4; // 4. turnuvadan itibaren Ranked


export default function LeaderboardPage() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => { setSpeakers(d.speakers || []); setLoading(false); });
  }, []);

  const filtered = speakers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  // Ranked (≥ 4 turnuva) ve Unranked (< 4 turnuva) olarak ayır
  const rankedFiltered = filtered.filter(s => (s.total_tournaments ?? 0) >= UNRANKED_MIN_TOURNAMENTS);
  const unrankedFiltered = filtered.filter(s => (s.total_tournaments ?? 0) < UNRANKED_MIN_TOURNAMENTS);
  const globalRankedSpeakers = speakers.filter(s => (s.total_tournaments ?? 0) >= UNRANKED_MIN_TOURNAMENTS);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-10">
        <h1 className="text-5xl font-extrabold text-gradient mb-3">
          Münazara Rank
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Türk akademik münazara dünyasının resmi ELO sıralama sistemi
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Toplam Konuşmacı", value: speakers.length, icon: "🎙️" },
          { label: "En Yüksek ELO", value: speakers[0]?.elo ?? "—", icon: "👑" },
          { label: "Ort. ELO", value: speakers.length ? Math.round(speakers.reduce((a, s) => a + s.elo, 0) / speakers.length) : "—", icon: "📊" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5 text-center">
            <div className="text-3xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-gray-400 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Konuşmacı ara..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
        />
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
                <th className="px-6 py-4 text-right">ELO</th>
                <th className="px-6 py-4 text-right hidden md:table-cell">Turnuva</th>
                <th className="px-6 py-4 text-right hidden md:table-cell">Ort. Speak</th>
                <th className="px-6 py-4 text-right hidden lg:table-cell">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {rankedFiltered.map((sp) => {
                const globalRank = globalRankedSpeakers.findIndex((s) => s.id === sp.id) + 1;
                return <SpeakerRow key={sp.id} sp={sp} rank={globalRank} />;
              })}
              {unrankedFiltered.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} className="px-6 py-2 bg-white/[0.02] border-y border-white/10">
                      <span className="text-xs text-gray-500 uppercase tracking-widest">Unranked — Sıralamaya girmek için 4 turnuva gerekiyor</span>
                    </td>
                  </tr>
                  {unrankedFiltered.map((sp) => (
                    <SpeakerRow key={sp.id} sp={sp} isUnranked />
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
