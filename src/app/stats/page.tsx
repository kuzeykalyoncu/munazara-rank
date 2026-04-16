"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Speaker } from "@/lib/supabase";

function EloBadge({ elo }: { elo: number }) {
  let cls = "text-gray-400 bg-gray-500/10 border-gray-600/40";
  let label = "Başlangıç";
  if (elo > 2000) {
    cls = "text-yellow-300 bg-yellow-500/15 border-yellow-500/30";
    label = "Şampiyon";
  } else if (elo >= 1700) {
    cls = "text-violet-400 bg-violet-500/15 border-violet-500/30";
    label = "Uzman";
  } else if (elo >= 1400) {
    cls = "text-indigo-400 bg-indigo-500/15 border-indigo-500/30";
    label = "Avantajlı";
  } else if (elo >= 1200) {
    cls = "text-green-400 bg-green-500/15 border-green-500/30";
    label = "Yükselen";
  } else if (elo >= 1000) {
    cls = "text-blue-400 bg-blue-500/15 border-blue-500/30";
    label = "Standart";
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function StatsPage() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => {
        setSpeakers(d.speakers || []);
        setLoading(false);
      });
  }, []);

  // 1. ELO Distribution (Bell Curve)
  // Create bins of 25 ELO points (e.g. 975, 1000, 1025)
  const distributionData = (() => {
    if (speakers.length === 0) return [];

    const bins: Record<string, number> = {};
    const minElo = Math.min(...speakers.map((s) => s.elo));
    const maxElo = Math.max(...speakers.map((s) => s.elo));

    // Start bin from lowest multiple of 25
    const startBin = Math.floor(minElo / 25) * 25;
    const endBin = Math.ceil(maxElo / 25) * 25;

    for (let i = startBin; i <= endBin; i += 25) {
      bins[i.toString()] = 0;
    }

    speakers.forEach((s) => {
      const bin = Math.floor(s.elo / 25) * 25;
      if (bins[bin.toString()] !== undefined) {
        bins[bin.toString()]++;
      }
    });

    return Object.entries(bins).map(([elo, count]) => ({
      elo: parseInt(elo),
      count,
    }));
  })();

  // 2. Top Speakers by Break Count
  const topBreaks = [...speakers]
    .filter((s) => (s.career_break_count || 0) > 0)
    .sort((a, b) => {
      const breakDiff = (b.career_break_count || 0) - (a.career_break_count || 0);
      if (breakDiff !== 0) return breakDiff;
      return b.elo - a.elo;
    })
    .slice(0, 10);

  // 3. Top Speakers by Career Avg Speak (min 1 tournament)
  const topAvgSpeak = [...speakers]
    .filter((s) => s.total_tournaments >= 1)
    .sort((a, b) => b.career_avg_speak - a.career_avg_speak)
    .slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400">İstatistikler yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (speakers.length === 0) {
    return (
      <div className="text-center py-24 text-gray-500">
        Henüz veri yok. Admin panelinden turnuva ekleyin.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="text-center py-8">
        <h1 className="text-4xl font-extrabold text-gradient mb-3">
          Genel İstatistikler
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Topluluğun ELO dağılımı ve farklı metriklerdeki en iyi konuşmacılar
        </p>
      </div>

      {/* Bell Curve Chart */}
      <div className="glass rounded-2xl p-6 glow-indigo relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <div className="text-9xl">📊</div>
        </div>
        <h2 className="text-xl font-bold text-white mb-6 relative z-10 flex items-center gap-2">
          <span className="text-indigo-400">📈</span> ELO Çan Eğrisi (Dağılım)
        </h2>
        <div className="h-80 w-full relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={distributionData}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis
                dataKey="elo"
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(val) => `${val}`}
              />
              <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "0.5rem",
                  color: "#f8fafc",
                }}
                itemStyle={{ color: "#a5b4fc" }}
                labelFormatter={(label) => `ELO: ${label} - ${parseInt(label) + 24}`}
                formatter={(value: number) => [value, "Konuşmacı"]}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#818cf8"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorCount)"
                activeDot={{ r: 6, fill: "#c7d2fe" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Breaks */}
        <div className="glass rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="text-cyan-400">🔥</span> En Çok Break Yapanlar
          </h2>
          <div className="space-y-2">
            {topBreaks.map((sp, i) => (
              <Link
                key={sp.id}
                href={`/speakers/${sp.id}`}
                className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition rounded-xl p-3 group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 text-center text-gray-500 font-mono text-sm">
                    {i + 1}.
                  </div>
                  <div>
                    <div className="text-white font-medium group-hover:text-cyan-400 transition">
                      {sp.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {sp.total_tournaments} Turnuva
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-cyan-400 font-bold text-lg">
                    {sp.career_break_count} Break
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 font-mono">
                    <EloBadge elo={sp.elo} />
                  </div>
                </div>
              </Link>
            ))}
            {topBreaks.length === 0 && (
              <div className="text-center py-4 text-sm text-gray-500">Henüz break verisi yok.</div>
            )}
          </div>
        </div>

        {/* Top Avg Speak */}
        <div className="glass rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="text-yellow-400">⭐</span> En Yüksek Ortalama Speak
          </h2>
          <div className="space-y-2">
            {topAvgSpeak.map((sp, i) => (
              <Link
                key={sp.id}
                href={`/speakers/${sp.id}`}
                className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition rounded-xl p-3 group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 text-center text-gray-500 font-mono text-sm">
                    {i + 1}.
                  </div>
                  <div>
                    <div className="text-white font-medium group-hover:text-yellow-400 transition">
                      {sp.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {sp.total_tournaments} Turnuva
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-yellow-400 font-bold text-lg">
                    {sp.career_avg_speak.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 font-mono">
                    <EloBadge elo={sp.elo} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
