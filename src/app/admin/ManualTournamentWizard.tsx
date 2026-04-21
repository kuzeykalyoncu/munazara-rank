"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ParsedSpeaker, ParsedTeam } from "@/app/api/admin/parse-tab/route";

interface Props {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setStatus: (v: string) => void;
  onDone: () => void;
}

type Step = "name" | "speakerTab" | "teamTab" | "finals" | "preview";

export default function ManualTournamentWizard({ loading, setLoading, setStatus, onDone }: Props) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [numRounds, setNumRounds] = useState(5);
  const [speakerText, setSpeakerText] = useState("");
  const [teamText, setTeamText] = useState("");
  const [parsedSpeakers, setParsedSpeakers] = useState<ParsedSpeaker[]>([]);
  const [parsedTeams, setParsedTeams] = useState<ParsedTeam[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [finalists, setFinalists] = useState<string[]>([]);
  const [champion, setChampion] = useState("");
  const [bestSpeaker, setBestSpeaker] = useState("");
  const [preview, setPreview] = useState<any[] | null>(null);
  const [tournamentId, setTournamentId] = useState<string | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function stepNum(s: Step) {
    return ["name", "speakerTab", "teamTab", "finals", "preview"].indexOf(s) + 1;
  }

  const steps: Step[] = ["name", "speakerTab", "teamTab", "finals", "preview"];
  const stepLabels = ["Turnuva", "Konuşmacı Tab", "Takım Tab", "Final & Şampiyon", "ELO Önizle"];

  // ── Step 1 → Step 2: Create tournament DB record ──────────────────────────
  async function handleNameNext() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tournaments")
        .insert({ name: name.trim(), base_url: "manual", status: "pending" })
        .select("id")
        .single();
      if (error) throw error;
      setTournamentId((data as any).id);
      setStep("speakerTab");
    } catch (e: any) {
      setStatus("❌ Turnuva oluşturulamadı: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2 → Step 3: Parse both tabs ─────────────────────────────────────
  async function handleParseTabs() {
    if (!speakerText.trim() || !teamText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/parse-tab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerText, teamText, numRounds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setParsedSpeakers(data.speakers || []);
      setParsedTeams(data.teams || []);
      setWarnings(data.warnings || []);
      setStep("teamTab");
    } catch (e: any) {
      setStatus("❌ Parse hatası: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4 → Preview: dry-run ELO ────────────────────────────────────────
  async function handlePreview() {
    if (!tournamentId || !champion || finalists.length < 2) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/process-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId, speakers: parsedSpeakers, teams: parsedTeams,
          finalists, champion, bestSpeaker, numRounds, dryRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data.speakers || []);
      setStep("preview");
    } catch (e: any) {
      setStatus("❌ Önizleme hatası: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Confirm & Save ────────────────────────────────────────────────────────
  async function handleConfirm() {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/process-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId, speakers: parsedSpeakers, teams: parsedTeams,
          finalists, champion, bestSpeaker, numRounds, dryRun: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus(`✅ "${name}" başarıyla eklendi. ${data.processed} konuşmacı güncellendi.`);
      onDone();
    } catch (e: any) {
      setStatus("❌ Kayıt hatası: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Speaker table edits ───────────────────────────────────────────────────
  function updateSpeaker(idx: number, field: keyof ParsedSpeaker, value: any) {
    setParsedSpeakers(prev => prev.map((sp, i) => i === idx ? { ...sp, [field]: value } : sp));
  }
  function updateTeam(idx: number, field: keyof ParsedTeam, value: any) {
    setParsedTeams(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }
  function updateTeamSpeaker(teamIdx: number, spIdx: number, value: string) {
    setParsedTeams(prev => prev.map((t, i) => {
      if (i !== teamIdx) return t;
      const spk = [...t.speakers];
      spk[spIdx] = value;
      return { ...t, speakers: spk };
    }));
  }

  // ── Step progress bar ─────────────────────────────────────────────────────
  const currentNum = stepNum(step);

  return (
    <div className="glass rounded-2xl overflow-hidden border border-violet-500/20">
      {/* Header with step progress */}
      <div className="px-6 py-4 bg-violet-500/10 border-b border-violet-500/20">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
          <span>📋</span> Manuel Turnuva Girişi
          <span className="text-xs font-normal text-violet-400 bg-violet-500/15 border border-violet-500/20 px-2 py-0.5 rounded-full">
            Adım {currentNum} / {steps.length}
          </span>
        </h2>
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-1.5 w-full rounded-full transition-all ${i < currentNum ? "bg-violet-500" : i === currentNum - 1 ? "bg-violet-400" : "bg-white/10"}`} />
              <span className={`text-xs hidden sm:block ${i === currentNum - 1 ? "text-violet-300" : "text-gray-600"}`}>{stepLabels[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* ── Step 1: Turnuva Adı ── */}
        {step === "name" && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">Tabbycat linki olmayan turnuvanın bilgilerini girin.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Turnuva Adı (örn: 3. Başkent Open)"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
              />
              <div className="flex items-center gap-2">
                <label className="text-gray-400 text-sm whitespace-nowrap">Tur Sayısı:</label>
                <input
                  type="number" min={1} max={10} value={numRounds}
                  onChange={e => setNumRounds(parseInt(e.target.value) || 5)}
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-center focus:outline-none focus:border-violet-500 transition"
                />
              </div>
            </div>
            <button onClick={handleNameNext} disabled={!name.trim() || loading}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold disabled:opacity-50 hover:from-violet-500 hover:to-indigo-500 transition-all">
              Devam →
            </button>
          </div>
        )}

        {/* ── Step 2: Speaker Tab ── */}
        {step === "speakerTab" && (
          <div className="space-y-4">
            <div>
              <label className="text-white font-medium block mb-2">Konuşmacı Tabı (Speaker Tab)</label>
              <p className="text-gray-500 text-xs mb-3">PDF&apos;den kopyalayıp yapıştırın. Şu formatta olmalı: Sıra / İsim / Takım / Toplam / R1 / R2... (satır satır)</p>
              <textarea value={speakerText} onChange={e => setSpeakerText(e.target.value)}
                rows={12} placeholder={"1  Gökhan Kabacaoğlu  HACETTEPE Chivas Regal 18  382  75  76  78  77  76\n2  İbrahim Aydın  ODTÜ IMF'nin Mutemet Adamı  379  74  76  77  75  77\n..."}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition font-mono text-xs resize-none"
              />
            </div>
            <div>
              <label className="text-white font-medium block mb-2">Takım Tabı (Team Tab)</label>
              <p className="text-gray-500 text-xs mb-3">Formatta olmalı: Sıra / Takım / Toplam Rank / Toplam SP / #PullUp / SP R1..Rn / Rank R1..Rn</p>
              <textarea value={teamText} onChange={e => setTeamText(e.target.value)}
                rows={12} placeholder={"1  OPEN Take Me To Mosque  12  752  1  148  146  150  154  154  2  2  2  3  3\n2  HACETTEPE Chivas Regal 18  11  759  1  150  151  154  153  151  3  3  2  3  0\n..."}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition font-mono text-xs resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("name")} className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm">← Geri</button>
              <button onClick={handleParseTabs} disabled={!speakerText.trim() || !teamText.trim() || loading}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold disabled:opacity-50 hover:from-violet-500 hover:to-indigo-500 transition-all">
                {loading ? "Parse ediliyor..." : "🔍 Parse Et →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Düzenle ── */}
        {step === "teamTab" && (
          <div className="space-y-6">
            {warnings.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                <p className="text-yellow-400 text-xs font-semibold mb-2">⚠️ Parse Uyarıları</p>
                {warnings.map((w, i) => <p key={i} className="text-yellow-300 text-xs">{w}</p>)}
              </div>
            )}

            {/* Speaker table */}
            <div>
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">🎙️ Konuşmacılar <span className="text-gray-500 text-sm font-normal">({parsedSpeakers.length} kişi)</span></h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-black/60">
                    <tr className="text-gray-400 text-left">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">İsim</th>
                      <th className="px-3 py-2">Takım</th>
                      {Array.from({ length: numRounds }, (_, i) => <th key={i} className="px-3 py-2 text-center">R{i + 1}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedSpeakers.map((sp, idx) => (
                      <tr key={idx} className="border-t border-white/5 hover:bg-white/3">
                        <td className="px-3 py-1.5 text-gray-500">{sp.position}</td>
                        <td className="px-3 py-1.5">
                          <input value={sp.name} onChange={e => updateSpeaker(idx, "name", e.target.value)}
                            className="bg-transparent border border-transparent hover:border-white/20 focus:border-violet-500 rounded px-1 py-0.5 text-white w-full focus:outline-none" />
                        </td>
                        <td className="px-3 py-1.5 text-gray-400 text-xs">{sp.team || "—"}</td>
                        {sp.scores.map((s, si) => (
                          <td key={si} className="px-3 py-1.5 text-center">
                            <input type="number" value={s} onChange={e => {
                              const sc = [...sp.scores]; sc[si] = parseFloat(e.target.value) || 0;
                              updateSpeaker(idx, "scores", sc);
                            }}
                              className={`w-12 text-center bg-transparent border border-transparent hover:border-white/20 focus:border-violet-500 rounded px-1 py-0.5 focus:outline-none ${s === 0 ? "text-gray-600" : "text-white"}`} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Team table */}
            <div>
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">🏆 Takımlar <span className="text-gray-500 text-sm font-normal">({parsedTeams.length} takım)</span></h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-black/60">
                    <tr className="text-gray-400 text-left">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Takım Adı</th>
                      <th className="px-3 py-2">Konuşmacılar</th>
                      {Array.from({ length: numRounds }, (_, i) => <th key={i} className="px-3 py-2 text-center">R{i + 1} Rank</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTeams.map((t, idx) => (
                      <tr key={idx} className="border-t border-white/5 hover:bg-white/3">
                        <td className="px-3 py-1.5 text-gray-500">{t.position}</td>
                        <td className="px-3 py-1.5">
                          <input value={t.teamName} onChange={e => updateTeam(idx, "teamName", e.target.value)}
                            className="bg-transparent border border-transparent hover:border-white/20 focus:border-violet-500 rounded px-1 py-0.5 text-white w-full focus:outline-none" />
                        </td>
                        <td className="px-3 py-1.5 text-gray-400 max-w-xs">
                          {t.speakers.map((sp, si) => (
                            <input key={si} value={sp} onChange={e => updateTeamSpeaker(idx, si, e.target.value)}
                              placeholder={`Konuşmacı ${si + 1}`}
                              className="block bg-transparent border-b border-white/10 focus:border-violet-500 text-white w-full focus:outline-none py-0.5 mb-0.5" />
                          ))}
                          {t.speakers.length === 0 && <span className="text-red-400 text-xs">⚠️ Eşleşme yok</span>}
                        </td>
                        {t.rankScores.map((r, ri) => (
                          <td key={ri} className="px-3 py-1.5 text-center">
                            <select value={r} onChange={e => {
                              const rs = [...t.rankScores]; rs[ri] = parseInt(e.target.value);
                              updateTeam(idx, "rankScores", rs);
                            }}
                              className={`bg-black/50 border rounded px-1 py-0.5 focus:outline-none text-xs ${r === 3 ? "border-green-500/40 text-green-400" : r === 2 ? "border-blue-500/40 text-blue-400" : r === 1 ? "border-yellow-500/40 text-yellow-400" : "border-red-500/40 text-red-400"}`}>
                              <option value={3}>3 (1.)</option>
                              <option value={2}>2 (2.)</option>
                              <option value={1}>1 (3.)</option>
                              <option value={0}>0 (4./Yok)</option>
                            </select>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("speakerTab")} className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm">← Geri</button>
              <button onClick={() => setStep("finals")}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:from-violet-500 hover:to-indigo-500 transition-all">
                Devam →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Final & Şampiyon ── */}
        {step === "finals" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-white font-semibold mb-3">🏆 Finalistler <span className="text-gray-500 text-xs font-normal">(finalde yer alan takımları seçin, genellikle 4 takım)</span></h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {parsedTeams.map(t => (
                  <label key={t.teamName} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${finalists.includes(t.teamName) ? "border-indigo-500/40 bg-indigo-500/10" : "border-white/10 bg-white/3 hover:bg-white/5"}`}>
                    <input type="checkbox" checked={finalists.includes(t.teamName)}
                      onChange={e => setFinalists(prev => e.target.checked ? [...prev, t.teamName] : prev.filter(f => f !== t.teamName))}
                      className="accent-indigo-500" />
                    <span className="text-white text-sm">{t.teamName}</span>
                  </label>
                ))}
              </div>
            </div>

            {finalists.length >= 2 && (
              <div>
                <h3 className="text-white font-semibold mb-3">🥇 Şampiyon</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {finalists.map(t => (
                    <label key={t} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${champion === t ? "border-yellow-500/40 bg-yellow-500/10" : "border-white/10 bg-white/3 hover:bg-white/5"}`}>
                      <input type="radio" name="champion" value={t} checked={champion === t} onChange={() => setChampion(t)} className="accent-yellow-500" />
                      <span className="text-white text-sm">{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-white font-semibold mb-3">🎙️ En İyi Konuşmacı <span className="text-gray-500 text-xs font-normal">(opsiyonel)</span></h3>
              <select value={bestSpeaker} onChange={e => setBestSpeaker(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition">
                <option value="">— Seçin —</option>
                {parsedSpeakers.map(sp => <option key={sp.name} value={sp.name}>{sp.name} ({sp.team})</option>)}
              </select>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("teamTab")} className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm">← Geri</button>
              <button onClick={handlePreview} disabled={!champion || finalists.length < 2 || loading}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold disabled:opacity-50 hover:from-violet-500 hover:to-indigo-500 transition-all">
                {loading ? "Hesaplanıyor..." : "🔍 ELO Önizle"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: ELO Preview ── */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">ELO değişimleri aşağıdadır. Onaylarsanız veritabanına kaydedilir.</p>
            <div className="max-h-96 overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/70">
                  <tr className="text-gray-400 text-xs uppercase tracking-wider text-left">
                    <th className="px-4 py-3">Konuşmacı</th>
                    <th className="px-4 py-3 text-right">ELO Sonrası</th>
                    <th className="px-4 py-3 text-right">Değişim</th>
                    <th className="px-4 py-3 text-center">Ort. SP</th>
                    <th className="px-4 py-3 text-center">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {[...preview].sort((a, b) => b.eloChange - a.eloChange).map((sp: any) => (
                    <tr key={sp.speakerId} className="border-t border-white/5 hover:bg-white/3">
                      <td className="px-4 py-2.5 text-white font-medium">{sp.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-indigo-300">{sp.eloAfter}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-bold ${sp.eloChange > 0 ? "text-green-400" : sp.eloChange < 0 ? "text-red-400" : "text-gray-500"}`}>
                        {sp.eloChange > 0 ? "+" : ""}{sp.eloChange}
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{sp.prelimSpeakAvg || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-xs">
                        {sp.didChamp && <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded mr-1">🥇</span>}
                        {sp.didFinal && !sp.didChamp && <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded mr-1">🏆</span>}
                        {sp.didBreak && <span className="px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded">Break</span>}
                        {sp.didBestSpeaker && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded ml-1">⭐</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("finals")} className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm">← Geri</button>
              <button onClick={handleConfirm} disabled={loading}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold hover:from-green-500 hover:to-emerald-500 transition-all disabled:opacity-50 shadow-lg shadow-green-500/20">
                {loading ? "Kaydediliyor..." : "✅ Onayla & Kaydet"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
