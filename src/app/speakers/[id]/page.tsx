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

interface RoundLog {
  id: string;
  tournament_id: string;
  round_name: string;
  is_outround: boolean;
  placement: number;
  partner_name: string | null;
  partner_sp: number | null;
  own_sp: number | null;
  sp_diff: number | null;
  distribution_mode: string;
  team_raw_delta: number;
  elo_change: number;
  elo_before: number;
  elo_after: number;
  tournaments: { name: string } | null;
}

interface SpeakerProfile {
  speaker: {
    id: string;
    name: string;
    elo: number;
    total_tournaments: number;
    win_rate: number;
    career_avg_speak: number;
    br_count: number;
    br_bonus_total: number;
    career_break_count: number;
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
  h2hTies: { id: string; winner: { name: string } | null; loser: { name: string } | null; round_count: number; tournament_id: string; round_name?: string; tournaments: { name: string } | null }[];
  tournamentStats: {
    id: string;
    speak_avg: number;
    break_status: boolean;
    final_status: boolean;
    champion_status: boolean;
    best_speaker_status: boolean;
    elo_change: number;
    carry_bonus: number;
    tournaments: { name: string; base_url: string; id?: string } | null;
    partner: { name: string; elo: number } | null;
  }[];
  roundLogs: RoundLog[];
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

function DistributionBadge({ mode }: { mode: string }) {
  if (mode === "performans") return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">Performans</span>;
  if (mode === "gelisim") return <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20">Gelişim</span>;
  if (mode === "kayip") return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">Kayıp</span>;
  if (mode === "outround") return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/20">Eleme</span>;
  return null;
}

function RoundAuditModal({ tournamentName, rounds, breakBonus, onClose }: {
  tournamentName: string;
  rounds: RoundLog[];
  breakBonus: boolean;
  onClose: () => void;
}) {
  const prelims = rounds.filter(r => !r.is_outround);
  const outrounds = rounds.filter(r => r.is_outround);
  const totalElo = rounds.reduce((sum, r) => sum + r.elo_change, 0) + (breakBonus ? 5 : 0);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">📋 Elo Dekontu: {tournamentName}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition text-xl">✕</button>
        </div>

        {/* Prelim Rounds */}
        {prelims.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Grup Turları</div>
            <div className="space-y-2">
              {prelims.map((r, i) => (
                <div key={r.id} className="bg-white/3 rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{r.round_name}</span>
                      <span className="text-gray-600 text-xs">#{r.placement}. Sıra</span>
                      <DistributionBadge mode={r.distribution_mode} />
                    </div>
                    <span className={`font-bold font-mono text-sm ${r.elo_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {r.elo_change >= 0 ? '+' : ''}{r.elo_change.toFixed(1)} Elo
                    </span>
                  </div>
                  {r.partner_name && (
                    <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      <span>
                        Takım arkadaşı: <span className="text-gray-300">{r.partner_name}</span>
                        {r.partner_sp !== null && <span className="text-indigo-400 ml-1">(SP: {r.partner_sp})</span>}
                      </span>
                      {r.own_sp !== null && (
                        <>
                          <span className="text-gray-700">|</span>
                          <span>Kendi SP: <span className="text-gray-300">{r.own_sp}</span></span>
                        </>
                      )}
                      {r.sp_diff !== null && (
                        <>
                          <span className="text-gray-700">|</span>
                          <span>Fark: <span className={r.sp_diff > 1 ? 'text-blue-400' : 'text-purple-400'}>{r.sp_diff} puan</span></span>
                          <span className="text-gray-600 text-xs">({r.sp_diff > 1 ? '→ Performans modu' : '→ Gelişim modu'})</span>
                        </>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-gray-600">
                    {r.elo_before.toFixed(0)} → {r.elo_after.toFixed(0)} ELO
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outrounds */}
        {outrounds.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Eleme Turları</div>
            <div className="space-y-2">
              {outrounds.map(r => (
                <div key={r.id} className="bg-white/3 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm">{r.round_name}</span>
                    <span className="text-gray-600 text-xs">#{r.placement}. Sıra</span>
                    <DistributionBadge mode="outround" />
                  </div>
                  <span className={`font-bold font-mono text-sm ${r.elo_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {r.elo_change >= 0 ? '+' : ''}{r.elo_change.toFixed(1)} Elo
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Break Bonus */}
        {breakBonus && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-green-400 text-sm">⚡ Break Bonusu</span>
            <span className="font-bold font-mono text-sm text-green-400">+5 Elo</span>
          </div>
        )}

        {/* Total */}
        <div className="border-t border-white/10 pt-3 flex items-center justify-between">
          <span className="text-gray-300 font-semibold">Net Toplam</span>
          <span className={`text-xl font-extrabold font-mono ${totalElo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalElo >= 0 ? '+' : ''}{totalElo.toFixed(1)} ELO
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SpeakerProfilePage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<SpeakerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auditModal, setAuditModal] = useState<{ tournamentId: string; tournamentName: string; breakStatus: boolean } | null>(null);
  const [showBreakList, setShowBreakList] = useState(false);

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

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Profil yükleniyor...</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-24 text-gray-500">
      {error || "Konuşmacı bulunamadı."}
    </div>
  );

  const { speaker, eloHistory, h2hWins, h2hLosses, h2hTies, tournamentStats, roundLogs } = data;

  const chartData = eloHistory.map((h, i) => ({
    name: h.tournaments?.name?.slice(0, 15) ?? `T${i + 1}`,
    elo: h.elo_after,
    tournamentId: (h as any).tournament_id ?? "",
  }));

  // Build H2H map — beraberlikler gösterilmiyor, sadece G/M
  const h2hMap: Record<string, { name: string; wins: number; losses: number; matches: { tournament: string; round: string; result: string }[] }> = {};
  for (const w of h2hWins) {
    const opp = w.loser?.name ?? "Bilinmiyor";
    if (!h2hMap[opp]) h2hMap[opp] = { name: opp, wins: 0, losses: 0, matches: [] };
    h2hMap[opp].wins += w.round_count;
    h2hMap[opp].matches.push({ tournament: w.tournaments?.name || "Bilinmeyen Turnuva", round: w.round_name || "Bilinmeyen Tur", result: "Galibiyet" });
  }
  for (const l of h2hLosses) {
    const opp = l.winner?.name ?? "Bilinmiyor";
    if (!h2hMap[opp]) h2hMap[opp] = { name: opp, wins: 0, losses: 0, matches: [] };
    h2hMap[opp].losses += l.round_count;
    h2hMap[opp].matches.push({ tournament: l.tournaments?.name || "Bilinmeyen Turnuva", round: l.round_name || "Bilinmeyen Tur", result: "Mağlubiyet" });
  }
  // Beraberlikler yok sayılıyor — BP'de finalist beraberliği gerçek bir karşılaşma değil
  const h2hList = Object.values(h2hMap)
    .filter(r => r.wins > 0 || r.losses > 0)
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  const initials = speaker.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const totalH2H = h2hWins.reduce((a, w) => a + w.round_count, 0) + h2hLosses.reduce((a, l) => a + l.round_count, 0);

  // Group roundLogs by tournament_id
  const roundLogsByTournament: Record<string, RoundLog[]> = {};
  for (const r of (roundLogs || [])) {
    if (!roundLogsByTournament[r.tournament_id]) roundLogsByTournament[r.tournament_id] = [];
    roundLogsByTournament[r.tournament_id].push(r);
  }

  // Determine which tournament stat is open
  const openAuditRounds = auditModal ? roundLogsByTournament[auditModal.tournamentId] || [] : [];

  const careerBreaks = speaker.career_break_count ?? speaker.br_count ?? 0;
  const totalBreakBonus = careerBreaks * 5;

  // Break yapılan turnuvalar — break_status true olanlar
  // Fallback: elo_history toplam delta ile round log toplamı karşılaştır (+5 break bonusu varsa)
  const roundEloByTournament: Record<string, number> = {};
  for (const r of (roundLogs || [])) {
    if (!roundEloByTournament[r.tournament_id]) roundEloByTournament[r.tournament_id] = 0;
    roundEloByTournament[r.tournament_id] += r.elo_change;
  }

  const breakTournaments = tournamentStats
    .filter(s => {
      if (s.break_status === true) return true; // doğrudan kaynak
      // Fallback: elo_history delta - round toplamı ≥ 4 ise break var
      const tId = (s as any).tournament_id;
      const histEntry = eloHistory.find(h => (h as any).tournament_id === tId);
      if (!histEntry) return false;
      const histDelta = histEntry.elo_after - histEntry.elo_before;
      const roundSum = roundEloByTournament[tId] || 0;
      return (histDelta - roundSum) >= 4; // break bonus tam +5, 1 yuvarlanma payı
    })
    .map(s => ({
      name: s.tournaments?.name ?? "Bilinmeyen Turnuva",
      isChamp: s.champion_status,
      isFinal: s.final_status,
    }));

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
                <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">🏆 Şampiyon</span>
              )}
              {tournamentStats.some((s) => s.best_speaker_status) && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">🎙️ En İyi Konuşmacı</span>
              )}
              {careerBreaks > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">⚡ {careerBreaks}x Break</span>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-extrabold font-mono text-gradient">{speaker.elo}</div>
            <div className="text-gray-400 text-sm mt-1">ELO Puanı</div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <StatCard label="Turnuva" value={speaker.total_tournaments} />
          <StatCard label="Ort. Prelim SP" value={speaker.career_avg_speak?.toFixed(1) ?? "—"} />
          <StatCard label="H2H Maç" value={totalH2H} />
          {/* Break Sayısı — tıklanabilir */}
          <div className="relative">
            <button
              onClick={() => setShowBreakList(v => !v)}
              className={`glass rounded-xl p-4 text-center w-full transition hover:ring-1 hover:ring-blue-500/50 ${careerBreaks > 0 ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="text-2xl font-bold text-white">{careerBreaks}</div>
              <div className="text-gray-400 text-xs mt-0.5">Break Sayısı</div>
              {careerBreaks > 0 && <div className="text-indigo-400 text-xs mt-1">+{totalBreakBonus} Elo Bonus</div>}
            </button>
            {showBreakList && careerBreaks > 0 && (
              <div
                className="absolute z-50 top-full mt-2 left-0 right-0 glass rounded-xl border border-white/10 shadow-xl overflow-hidden"
                style={{minWidth: "200px"}}
              >
                <div className="px-3 py-2 border-b border-white/10">
                  <span className="text-xs text-gray-500 uppercase tracking-widest">Break Yapılan Turnuvalar</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {breakTournaments.length > 0 ? breakTournaments.map((t, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 border-b border-white/5 last:border-0">
                      <span className="text-sm text-white truncate flex-1">{t.name}</span>
                      <div className="flex gap-1 ml-2 shrink-0">
                        {t.isChamp && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">🏆</span>}
                        {t.isFinal && !t.isChamp && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">Final</span>}
                      </div>
                    </div>
                  )) : (
                    <div className="px-3 py-4 text-sm text-gray-500 text-center">
                      Turnuva listesi görüntülenemedi.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

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
                <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
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
                    <div className="flex items-center gap-1.5 text-sm shrink-0">
                      <span className="text-green-400 font-bold">{record.wins}G</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-red-400 font-bold">{record.losses}M</span>
                    </div>
                    <div className="w-24 hidden sm:block">
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all" style={{ width: `${winPct}%` }} />
                      </div>
                    </div>
                    <div className={`text-xs font-mono w-10 text-right ${winPct >= 50 ? "text-green-400" : winPct > 0 ? "text-red-400" : "text-gray-500"}`}>
                      {winPct.toFixed(0)}%
                    </div>
                  </div>
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
            {tournamentStats.map((stat: any, i) => {
              const tId = stat.tournament_id ?? "";
              const hasRoundLog = tId && roundLogsByTournament[tId]?.length > 0;
              return (
                <div key={i} className="bg-white/3 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-white text-sm">
                        {stat.tournaments?.name ?? "Bilinmeyen Turnuva"}
                      </div>
                      {stat.partner && (
                        <div className="text-gray-500 text-xs mt-0.5">
                          Partner: <span className="text-gray-400">{stat.partner.name}</span>
                          <span className="ml-1 text-gray-600">({stat.partner.elo} ELO)</span>
                        </div>
                      )}
                      <div className="text-gray-600 text-xs mt-0.5">
                        Ort. Prelim SP: <span className="text-gray-400">{stat.speak_avg?.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {hasRoundLog && (
                        <button
                          onClick={() => setAuditModal({ tournamentId: tId, tournamentName: stat.tournaments?.name ?? "Turnuva", breakStatus: stat.break_status })}
                          className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition"
                        >
                          📋 Dekont
                        </button>
                      )}
                      <div className="text-right">
                        <div className={`text-sm font-bold font-mono ${(stat.elo_change + stat.carry_bonus) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {stat.elo_change + stat.carry_bonus >= 0 ? "+" : ""}
                          {stat.elo_change + stat.carry_bonus} ELO
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {stat.champion_status && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">🏆 Şampiyon</span>}
                    {stat.final_status && !stat.champion_status && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">🥈 Finalist</span>}
                    {stat.break_status && !stat.final_status && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">⚡ Break</span>}
                    {stat.best_speaker_status && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">🎙️ En İyi Konuşmacı</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tournamentStats.length === 0 && h2hList.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center text-gray-500">
          Bu konuşmacı için henüz turnuva verisi bulunmuyor.
        </div>
      )}

      {/* Audit Modal */}
      {auditModal && (
        <RoundAuditModal
          tournamentName={auditModal.tournamentName}
          rounds={openAuditRounds}
          breakBonus={auditModal.breakStatus}
          onClose={() => setAuditModal(null)}
        />
      )}
    </div>
  );
}
