"use client";

import React, { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ParsedSpeaker, ParsedTeam } from "@/app/api/admin/parse-tab/route";

interface Props {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setStatus: (v: string) => void;
  onDone: () => void;
}

type Step = "name" | "upload" | "edit" | "finals" | "preview";

// ── PDF Drag-Drop Zone ────────────────────────────────────────────────────────
function PdfDropZone({ label, hint, onExtracted, extracted }: {
  label: string; hint: string;
  onExtracted: (text: string) => void;
  extracted: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fileName, setFileName] = useState("");

  async function extractPdf(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    setExtracting(true);
    setFileName(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/extract-pdf", { method: "POST", body: form });
      const { text, error } = await res.json();
      if (error) throw new Error(error);
      onExtracted(text || "");
    } catch (e: any) {
      alert("PDF okunurken hata: " + e.message);
    } finally {
      setExtracting(false);
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) extractPdf(file);
  }, []);

  return (
    <div>
      <p className="text-white font-medium mb-2">{label}</p>
      <p className="text-gray-500 text-xs mb-3">{hint}</p>
      <label
        className={`flex flex-col items-center justify-center gap-3 w-full h-36 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
          dragging ? "border-violet-400 bg-violet-500/10 scale-[1.01]" :
          extracted ? "border-green-500/40 bg-green-500/5" :
          "border-white/15 bg-white/3 hover:border-violet-500/40 hover:bg-violet-500/5"
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input type="file" accept=".pdf" className="hidden" onChange={e => {
          const file = e.target.files?.[0];
          if (file) extractPdf(file);
        }} />
        {extracting ? (
          <>
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-violet-400 text-sm">PDF okunuyor…</p>
          </>
        ) : extracted ? (
          <>
            <span className="text-3xl">✅</span>
            <p className="text-green-400 text-sm font-medium">{fileName}</p>
            <p className="text-gray-500 text-xs">Başka bir dosya sürükleyerek değiştir</p>
          </>
        ) : (
          <>
            <span className="text-4xl opacity-40">📄</span>
            <p className="text-gray-400 text-sm">PDF&apos;i buraya sürükle veya tıklayarak seç</p>
          </>
        )}
      </label>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────
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

  const steps: Step[] = ["name", "upload", "edit", "finals", "preview"];
  const stepLabels = ["Turnuva", "PDF Yükle", "Düzenle", "Final & Şampiyon", "ELO Önizle"];
  const currentNum = steps.indexOf(step) + 1;

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleNameNext() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tournaments")
        .insert({ name: name.trim(), base_url: "manual", status: "pending" })
        .select("id").single();
      if (error) throw error;
      setTournamentId((data as any).id);
      setStep("upload");
    } catch (e: any) {
      setStatus("❌ Turnuva oluşturulamadı: " + e.message);
    } finally {
      setLoading(false);
    }
  }

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
      setStep("edit");
    } catch (e: any) {
      setStatus("❌ Parse hatası: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    if (!tournamentId || !champion || finalists.length < 2) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/process-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, speakers: parsedSpeakers, teams: parsedTeams, finalists, champion, bestSpeaker, numRounds, dryRun: true }),
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

  async function handleConfirm() {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/process-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, speakers: parsedSpeakers, teams: parsedTeams, finalists, champion, bestSpeaker, numRounds, dryRun: false }),
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

  function updateSpeaker(idx: number, field: keyof ParsedSpeaker, value: any) {
    setParsedSpeakers(prev => prev.map((sp, i) => i === idx ? { ...sp, [field]: value } : sp));
  }
  function updateTeam(idx: number, field: keyof ParsedTeam, value: any) {
    setParsedTeams(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }
  function updateTeamSpeaker(teamIdx: number, spIdx: number, value: string) {
    setParsedTeams(prev => prev.map((t, i) => {
      if (i !== teamIdx) return t;
      const spk = [...t.speakers]; spk[spIdx] = value;
      return { ...t, speakers: spk };
    }));
  }

  return (
    <div className="glass rounded-2xl overflow-hidden border border-violet-500/20">
      {/* Header */}
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

        {/* ── Adım 1: Turnuva Adı ── */}
        {step === "name" && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">Tabbycat linki olmayan turnuvanın bilgilerini girin.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Turnuva Adı (örn: 3. Başkent Open)"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
              />
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4">
                <label className="text-gray-400 text-sm whitespace-nowrap">Tur Sayısı:</label>
                <input type="number" min={1} max={10} value={numRounds}
                  onChange={e => setNumRounds(parseInt(e.target.value) || 5)}
                  className="w-16 bg-transparent text-white text-center py-3 focus:outline-none"
                />
              </div>
            </div>
            <button onClick={handleNameNext} disabled={!name.trim() || loading}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold disabled:opacity-50 hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/20">
              Devam →
            </button>
          </div>
        )}

        {/* ── Adım 2: PDF Yükle ── */}
        {step === "upload" && (
          <div className="space-y-6">
            <p className="text-gray-400 text-sm">
              Turnuvanın <strong className="text-white">Speaker Tab</strong> ve <strong className="text-white">Team Tab</strong> PDF dosyalarını sürükleyip bırakın veya tıklayarak seçin.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PdfDropZone
                label="🎙️ Speaker Tab PDF"
                hint="Konuşmacı sıralaması (isim / takım / puanlar)"
                onExtracted={setSpeakerText}
                extracted={!!speakerText}
              />
              <PdfDropZone
                label="🏆 Team Tab PDF"
                hint="Takım sıralaması (takım / rank R1..Rn / SP R1..Rn)"
                onExtracted={setTeamText}
                extracted={!!teamText}
              />
            </div>

            {(speakerText || teamText) && (
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 bg-white/3 rounded-xl p-3">
                <div>
                  <p className="text-gray-400 font-medium mb-1">Speaker Tab önizleme:</p>
                  <pre className="whitespace-pre-wrap line-clamp-4 font-mono text-gray-600">{speakerText.slice(0, 300)}</pre>
                </div>
                <div>
                  <p className="text-gray-400 font-medium mb-1">Team Tab önizleme:</p>
                  <pre className="whitespace-pre-wrap line-clamp-4 font-mono text-gray-600">{teamText.slice(0, 300)}</pre>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep("name")} className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm">← Geri</button>
              <button onClick={handleParseTabs} disabled={!speakerText.trim() || !teamText.trim() || loading}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold disabled:opacity-50 hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/20">
                {loading ? "Parse ediliyor…" : "🔍 Analiz Et →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Adım 3: Düzenle ── */}
        {step === "edit" && (
          <div className="space-y-6">
            {warnings.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                <p className="text-yellow-400 text-xs font-semibold mb-2">⚠️ Parse Uyarıları — Manuel düzeltme gerekebilir</p>
                {warnings.map((w, i) => <p key={i} className="text-yellow-300 text-xs mt-1">• {w}</p>)}
              </div>
            )}

            {/* Speaker table */}
            <div>
              <h3 className="text-white font-semibold mb-3">🎙️ Konuşmacılar <span className="text-gray-500 text-sm font-normal">({parsedSpeakers.length} kişi)</span></h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-black/80 backdrop-blur">
                    <tr className="text-gray-400 text-left">
                      <th className="px-3 py-2 w-8">#</th>
                      <th className="px-3 py-2">İsim</th>
                      <th className="px-3 py-2">Takım</th>
                      {Array.from({ length: numRounds }, (_, i) => <th key={i} className="px-3 py-2 text-center">R{i + 1}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedSpeakers.map((sp, idx) => (
                      <tr key={idx} className="border-t border-white/5 hover:bg-white/3">
                        <td className="px-3 py-1.5 text-gray-600">{sp.position}</td>
                        <td className="px-3 py-1.5">
                          <input value={sp.name} onChange={e => updateSpeaker(idx, "name", e.target.value)}
                            className="bg-transparent border border-transparent hover:border-white/20 focus:border-violet-500 rounded px-1 py-0.5 text-white w-full focus:outline-none min-w-32" />
                        </td>
                        <td className="px-3 py-1.5">
                          <input value={sp.team} onChange={e => updateSpeaker(idx, "team", e.target.value)}
                            className="bg-transparent border border-transparent hover:border-white/20 focus:border-violet-500 rounded px-1 py-0.5 text-gray-400 w-full focus:outline-none min-w-32" />
                        </td>
                        {sp.scores.map((s, si) => (
                          <td key={si} className="px-2 py-1.5 text-center">
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
              <h3 className="text-white font-semibold mb-3">🏆 Takımlar <span className="text-gray-500 text-sm font-normal">({parsedTeams.length} takım)</span></h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-black/80 backdrop-blur">
                    <tr className="text-gray-400 text-left">
                      <th className="px-3 py-2 w-8">#</th>
                      <th className="px-3 py-2">Takım Adı</th>
                      <th className="px-3 py-2">Konuşmacılar</th>
                      {Array.from({ length: numRounds }, (_, i) => <th key={i} className="px-3 py-2 text-center">R{i + 1}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTeams.map((t, idx) => (
                      <tr key={idx} className="border-t border-white/5 hover:bg-white/3">
                        <td className="px-3 py-1.5 text-gray-600">{t.position}</td>
                        <td className="px-3 py-1.5">
                          <input value={t.teamName} onChange={e => updateTeam(idx, "teamName", e.target.value)}
                            className="bg-transparent border border-transparent hover:border-white/20 focus:border-violet-500 rounded px-1 py-0.5 text-white w-full focus:outline-none min-w-40" />
                        </td>
                        <td className="px-3 py-1.5">
                          {(t.speakers.length > 0 ? t.speakers : ["", ""]).map((sp, si) => (
                            <input key={si} value={sp} onChange={e => updateTeamSpeaker(idx, si, e.target.value)}
                              placeholder={`Konuşmacı ${si + 1}`}
                              className={`block bg-transparent border-b focus:border-violet-500 w-full focus:outline-none py-0.5 mb-0.5 min-w-28 ${sp ? "text-white border-white/10" : "text-red-400 border-red-500/20 placeholder-red-500/60"}`} />
                          ))}
                        </td>
                        {t.rankScores.map((r, ri) => (
                          <td key={ri} className="px-2 py-1.5 text-center">
                            <select value={r} onChange={e => {
                              const rs = [...t.rankScores]; rs[ri] = parseInt(e.target.value);
                              updateTeam(idx, "rankScores", rs);
                            }}
                              className={`bg-black/60 border rounded px-1 py-0.5 focus:outline-none text-xs ${r === 3 ? "border-green-500/40 text-green-400" : r === 2 ? "border-blue-500/40 text-blue-400" : r === 1 ? "border-yellow-500/40 text-yellow-400" : "border-red-500/40 text-red-400"}`}>
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
              <button onClick={() => setStep("upload")} className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm">← Geri</button>
              <button onClick={() => setStep("finals")}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/20">
                Devam →
              </button>
            </div>
          </div>
        )}

        {/* ── Adım 4: Final & Şampiyon ── */}
        {step === "finals" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-white font-semibold mb-3">🏆 Finalistler
                <span className="text-gray-500 text-xs font-normal ml-2">(finalde yer alan takımları seçin, genellikle 4)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {parsedTeams.map(t => (
                  <label key={t.teamName} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${finalists.includes(t.teamName) ? "border-indigo-500/40 bg-indigo-500/10" : "border-white/10 bg-white/3 hover:bg-white/5"}`}>
                    <input type="checkbox" checked={finalists.includes(t.teamName)}
                      onChange={e => setFinalists(prev => e.target.checked ? [...prev, t.teamName] : prev.filter(f => f !== t.teamName))}
                      className="accent-indigo-500 w-4 h-4" />
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
                      <input type="radio" name="champion" value={t} checked={champion === t} onChange={() => setChampion(t)} className="accent-yellow-500 w-4 h-4" />
                      <span className="text-white text-sm">{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-white font-semibold mb-3">⭐ En İyi Konuşmacı <span className="text-gray-500 text-xs font-normal">(opsiyonel)</span></h3>
              <select value={bestSpeaker} onChange={e => setBestSpeaker(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500 transition">
                <option value="">— Seçin —</option>
                {parsedSpeakers.map(sp => <option key={sp.name} value={sp.name}>{sp.name} ({sp.team})</option>)}
              </select>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("edit")} className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm">← Geri</button>
              <button onClick={handlePreview} disabled={!champion || finalists.length < 2 || loading}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold disabled:opacity-50 hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/20">
                {loading ? "Hesaplanıyor…" : "🔍 ELO Önizle"}
              </button>
            </div>
          </div>
        )}

        {/* ── Adım 5: ELO Önizleme ── */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">ELO değişimleri aşağıdadır. Onaylarsanız veritabanına kaydedilir.</p>
            <div className="max-h-96 overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/80 backdrop-blur">
                  <tr className="text-gray-400 text-xs uppercase tracking-wider text-left">
                    <th className="px-4 py-3">Konuşmacı</th>
                    <th className="px-4 py-3 text-right">ELO</th>
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
                      <td className="px-4 py-2.5 text-center text-xs space-x-1">
                        {sp.didChamp && <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded">🥇</span>}
                        {sp.didFinal && !sp.didChamp && <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded">🏆</span>}
                        {sp.didBreak && <span className="px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded">Break</span>}
                        {sp.didBestSpeaker && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">⭐</span>}
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
                {loading ? "Kaydediliyor…" : "✅ Onayla & Kaydet"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
