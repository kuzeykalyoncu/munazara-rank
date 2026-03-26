"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface SpeakerProfile {
  speaker: {
    id: string;
    name: string;
    elo: number;
    total_tournaments: number;
    win_rate: number;
    career_avg_speak: number;
  };
  eloHistory: {
    id: string;
    elo_before: number;
    elo_after: number;
    recorded_at: string;
    tournaments: { name: string; base_url: string } | null;
  }[];
  h2hWins: { id: string; loser: { name: string } | null; round_count: number; tournament_id: string; round_name?: string; tournaments: { name: string } | null }[];
  h2hLosses: { id: string; winner: { name: string } | null; round_count: number; tournament_id: string; round_name?: string; tournaments: { name: string } | null }[];
  tournamentStats: {
    id: string;
    speak_avg: number;
    break_status: boolean;
    final_status: boolean;
    champion_status: boolean;
    best_speaker_status: boolean;
    elo_change: number;
    carry_bonus: number;
    tournaments: { name: string; base_url: string } | null;
    partner: { name: string; elo: number } | null;
  }[];
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass rounded-xl p-4 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-gray-400 text-xs mt-0.5">{label}</div>
      {sub && <div className="text-indigo-400 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function EloBadge({ elo }: { elo: number }) {
  let cls = "text-gray-400 bg-gray-500/10 border-gray-600/40";
  let label = "Başlangıç";
  if (elo >= 1300) { cls = "text-yellow-300 bg-yellow-500/15 border-yellow-500/30"; label = "🏅 Efsane"; }
  else if (elo >= 1200) { cls = "text-violet-400 bg-violet-500/15 border-violet-500/30"; label = "💎 Grandmaster"; }
  else if (elo >= 1100) { cls = "text-indigo-400 bg-indigo-500/15 border-indigo-500/30"; label = "⚡ Master"; }
  else if (elo >= 1050) { cls = "text-green-400 bg-green-500/15 border-green-500/30"; label = "🌱 Uzman"; }
  return <span className={`text-sm px-3 py-1 rounded-full border font-medium ${cls}`}>{label}</span>;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass rounded-lg px-3 py-2 text-sm">
        <p className="text-gray-400">{label}</p>
        <p className="text-indigo-400 font-bold">{payload[0].value} ELO</p>
      </div>
    );
  }
  return null;
};

export default function SpeakerProfilePage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<SpeakerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/speakers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400">Profil yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-32">
        <p className="text-red-400 text-lg">{error || "Konuşmacı bulunamadı."}</p>
        <Link href="/" className="text-indigo-400 mt-2 inline-block hover:underline">
          ← Leaderboard&apos;a dön
        </Link>
      </div>
    );
  }

  const { speaker, eloHistory, h2hWins, h2hLosses, tournamentStats } = data;

  // Build chart data
  const chartData = eloHistory.map((e, i) => ({
    name: e.tournaments?.name?.split(" ")?.[0] ?? `T${i + 1}`,
    elo: e.elo_after,
  }));
  // Add starting point
  if (chartData.length > 0) {
    chartData.unshift({ name: "Başlangıç", elo: 1000 });
  }

  // Aggregate H2H
  const h2hMap: Record<string, { name: string; wins: number; losses: number; matches: any[] }> = {};
  for (const w of h2hWins) {
    const name = w.loser?.name ?? "Bilinmiyor";
    if (!h2hMap[name]) h2hMap[name] = { name, wins: 0, losses: 0, matches: [] };
    h2hMap[name].wins += w.round_count;
    h2hMap[name].matches.push({ 
        tournament: w.tournaments?.name || "Bilinmeyen Turnuva", 
        round: w.round_name || "Bilinmeyen Tur",
        result: "Galibiyet" 
    });
  }
  for (const l of h2hLosses) {
    const name = l.winner?.name ?? "Bilinmiyor";
    if (!h2hMap[name]) h2hMap[name] = { name, wins: 0, losses: 0, matches: [] };
    h2hMap[name].losses += l.round_count;
    h2hMap[name].matches.push({ 
        tournament: l.tournaments?.name || "Bilinmeyen Turnuva", 
        round: l.round_name || "Bilinmeyen Tur",
        result: "Mağlubiyet" 
    });
  }
  const h2hList = Object.values(h2hMap).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

  const initials = speaker.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const totalH2H = h2hWins.reduce((a, w) => a + w.round_count, 0) + h2hLosses.reduce((a, l) => a + l.round_count, 0);


  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Back */}
      <Link href="/" className="text-gray-500 hover:text-gray-300 transition text-sm flex items-center gap-1">
        ← Leaderboard
      </Link>

      {/* Hero Card */}
      <div className="glass rounded-2xl p-8 glow-indigo">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-extrabold text-3xl shadow-xl shadow-indigo-500/40 shrink-0">
            {initials}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-3xl font-extrabold text-white">{speaker.name}</h1>
            <div className="mt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
              <EloBadge elo={speaker.elo} />
              {tournamentStats.some((s) => s.champion_status) && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                  🏆 Şampiyon
                </span>
              )}
              {tournamentStats.some((s) => s.best_speaker_status) && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  🎙️ En İyi Konuşmacı
                </span>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-extrabold font-mono text-gradient">{speaker.elo}</div>
            <div className="text-gray-400 text-sm mt-1">ELO Puanı</div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mt-6">
          <StatCard label="Turnuva" value={speaker.total_tournaments} />
          <StatCard label="Ort. Speak" value={speaker.career_avg_speak?.toFixed(1) ?? "—"} />
          <StatCard label="Win Rate" value={speaker.win_rate ? speaker.win_rate.toFixed(0) + "%" : "—"} />
          <StatCard label="H2H Maç" value={totalH2H} />
        </div>
      </div>

      {/* ELO Chart */}
      {chartData.length > 1 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <span>📈</span> ELO Tarihçesi
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={1000} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="elo"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ fill: "#6366f1", r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#818cf8", strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* H2H Records */}
      {h2hList.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span>⚔️</span> Head-to-Head Kayıtları
          </h2>
          <div className="space-y-4">
            {h2hList.map((record, i) => {
              const total = record.wins + record.losses;
              const winPct = total > 0 ? (record.wins / total) * 100 : 0;
              return (
                <div key={i} className="bg-white/3 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 font-bold text-white truncate">{record.name}</div>
                    <div className="flex items-center gap-2 text-sm shrink-0">
                      <span className="text-green-400 font-bold">{record.wins}G</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-red-400 font-bold">{record.losses}M</span>
                    </div>
                    <div className="w-24 hidden sm:block">
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                          style={{ width: `${winPct}%` }}
                        />
                      </div>
                    </div>
                    <div className={`text-xs font-mono w-10 text-right ${winPct >= 50 ? "text-green-400" : "text-red-400"}`}>
                      {winPct.toFixed(0)}%
                    </div>
                  </div>
                  
                  {/* Detailed Matches */}
                  <div className="pt-2 border-t border-white/5 space-y-1">
                    {record.matches.map((m, idx) => (
                      <div key={idx} className="flex justify-between text-[11px] text-gray-500">
                        <div className="truncate flex-1 pr-2">
                           <span className="text-gray-400">{m.tournament}</span>
                           <span className="mx-1 opacity-30">•</span>
                           <span>{m.round}</span>
                        </div>
                        <div className={m.result === "Galibiyet" ? "text-green-500/70" : "text-red-500/70"}>
                          {m.result}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* Tournament History */}
      {tournamentStats.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span>🏅</span> Turnuva Geçmişi
          </h2>
          <div className="space-y-3">
            {tournamentStats.map((stat, i) => (
              <div key={i} className="bg-white/3 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white text-sm">
                      {stat.tournaments?.name ?? "Bilinmeyen Turnuva"}
                    </div>
                    {stat.partner && (
                      <div className="text-gray-500 text-xs mt-0.5">
                        Partner: <span className="text-gray-400">{stat.partner.name}</span>
                        <span className="ml-1 text-gray-600">({stat.partner.elo} ELO)</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm font-bold font-mono ${
                        (stat.elo_change + stat.carry_bonus) >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {stat.elo_change + stat.carry_bonus >= 0 ? "+" : ""}
                      {stat.elo_change + stat.carry_bonus} ELO
                    </div>
                    <div className="text-gray-500 text-xs">Avg: {stat.speak_avg?.toFixed(1)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {stat.champion_status && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">🏆 Şampiyon</span>
                  )}
                  {stat.final_status && !stat.champion_status && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">🥈 Finalist</span>
                  )}
                  {stat.break_status && !stat.final_status && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">⚡ Break</span>
                  )}
                  {stat.best_speaker_status && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">🎙️ En İyi Konuşmacı</span>
                  )}
                  {stat.carry_bonus > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                      💪 Carry +{stat.carry_bonus}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tournamentStats.length === 0 && h2hList.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center text-gray-500">
          Bu konuşmacı için henüz turnuva verisi bulunmuyor.
        </div>
      )}
    </div>
  );
}
