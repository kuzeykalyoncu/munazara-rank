"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Tournament, Speaker } from "@/lib/supabase";
import ManualTournamentWizard from "./ManualTournamentWizard";

export type AliasItem = { name: string; tournaments: number };
export type AliasCluster = { id: string; items: AliasItem[] };

// ─── Editable Sheet Types ─────────────────────────────────────────────
interface EditableSpeakerSlot { name: string; sp: number; }
interface EditableTeamSlot { position: number; teamName: string; speakers: EditableSpeakerSlot[]; }
interface EditableRoom { id: string; label: string; teams: EditableTeamSlot[]; }
interface EditableRound { name: string; isOutround: boolean; rooms: EditableRoom[]; }
interface EditableData {
  tournamentName: string;
  rounds: EditableRound[];
  breakTeams: string[];
  bestSpeakers: string[];
  champions: string[];
  finalists: string[];
  inferredBreakCount: number;
}

function buildEditableData(preview: any, breakCountOverride?: number): EditableData {
  const { speakers, teams, results, tournamentName, inferredBreakCount } = preview;
  const teamSpeakersMap: Record<string, string[]> = {};
  for (const t of teams) teamSpeakersMap[t.name.toLowerCase()] = t.speakers;
  const speakerScores: Record<string, number[]> = {};
  for (const s of speakers) speakerScores[s.name] = s.scores || [];

  // Group rooms by round name, preserving insertion order
  const roundOrder: string[] = [];
  const roundGroups: Record<string, { isOutround: boolean; rooms: any[] }> = {};
  for (const room of (results.rooms || [])) {
    const key = room.name || "Tur";
    if (!roundGroups[key]) { roundGroups[key] = { isOutround: !!room.isOutround, rooms: [] }; roundOrder.push(key); }
    roundGroups[key].rooms.push(room);
  }

  // Determine prelim index: for each prelim round in order, assign 0,1,2...
  let prelIdx = 0;
  const roundPrelimIdx: Record<string, number> = {};
  for (const rn of roundOrder) {
    if (!roundGroups[rn].isOutround) { roundPrelimIdx[rn] = prelIdx++; }
    else roundPrelimIdx[rn] = -1;
  }

  const rounds: EditableRound[] = roundOrder.map(rn => {
    const group = roundGroups[rn];
    const scoreIdx = roundPrelimIdx[rn];
    const editRooms: EditableRoom[] = group.rooms.map((room, ri) => {
      const editTeams: EditableTeamSlot[] = (room.placements || []).map((tName: string, pos: number) => {
        const spNames = teamSpeakersMap[tName.toLowerCase()] || [];
        const editSpeakers: EditableSpeakerSlot[] = spNames.map(spName => ({
          name: spName,
          sp: scoreIdx >= 0 ? (speakerScores[spName]?.[scoreIdx] ?? 0) : 0,
        }));
        return { position: pos + 1, teamName: tName, speakers: editSpeakers };
      });
      // room.name is the round name — use Salon 1/2/3 for physical label
      return { id: `${rn}-${ri}`, label: `Salon ${ri + 1}`, teams: editTeams };
    });
    return { name: rn, isOutround: group.isOutround, rooms: editRooms };
  });

  // Determine break teams: use breakCountOverride if given, else use existing results.breaks
  const finalBreakCount = breakCountOverride != null && breakCountOverride > 0 ? breakCountOverride : 0;
  let breakTeams: string[] = results.breaks || [];
  if (finalBreakCount > 0 && teams.length > 0) {
    breakTeams = teams.slice(0, finalBreakCount).map((t: any) => t.name.toLowerCase());
  }

  return {
    tournamentName,
    rounds,
    breakTeams,
    bestSpeakers: results.bestSpeakers || [],
    champions: results.champions || [],
    finalists: results.finalists || [],
    inferredBreakCount: inferredBreakCount || 0,
  };
}

function reconstructScrapeData(editData: EditableData, original: any): any {
  // Rebuild speaker scores from edited SP values
  const speakerScoresMap: Record<string, number[]> = {};
  let prelIdx = 0;
  for (const round of editData.rounds) {
    if (!round.isOutround) {
      for (const room of round.rooms) {
        for (const team of room.teams) {
          for (const sp of team.speakers) {
            if (!speakerScoresMap[sp.name]) speakerScoresMap[sp.name] = [];
            speakerScoresMap[sp.name][prelIdx] = sp.sp;
          }
        }
      }
      prelIdx++;
    }
  }
  const updatedSpeakers = original.speakers.map((sp: any) => ({
    ...sp,
    scores: speakerScoresMap[sp.name] ?? sp.scores,
    totalPoints: (speakerScoresMap[sp.name] ?? sp.scores ?? []).reduce((a: number, b: number) => a + b, 0),
  }));
  const updatedRooms = editData.rounds.flatMap(round =>
    round.rooms.map(room => ({
      name: round.name,
      placements: [...room.teams].sort((a, b) => a.position - b.position).map(t => t.teamName),
      isOutround: round.isOutround,
    }))
  );
  return {
    ...original,
    speakers: updatedSpeakers,
    results: { ...original.results, rooms: updatedRooms, breaks: editData.breakTeams,
      bestSpeakers: editData.bestSpeakers, champions: editData.champions, finalists: editData.finalists },
  };
}

function EloTag({ elo }: { elo: number }) {
  let color = "text-gray-400 border-gray-600";
  if (elo > 2000)      color = "text-yellow-300 border-yellow-500 bg-yellow-500/10";
  else if (elo >= 1700) color = "text-violet-400 border-violet-500 bg-violet-500/10";
  else if (elo >= 1400) color = "text-indigo-400 border-indigo-500 bg-indigo-500/10";
  else if (elo >= 1200) color = "text-green-400 border-green-500 bg-green-500/10";
  else if (elo >= 1000) color = "text-blue-400 border-blue-500 bg-blue-500/10";

  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${color}`}>
      {elo} ELO
    </span>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [tournamentUrl, setTournamentUrl] = useState("");
  const [breakCount, setBreakCount] = useState("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [scrapePreview, setScrapePreview] = useState<null | {
    tournamentName: string;
    speakers: { name: string; totalPoints: number }[];
    teams: { name: string; speakers: string[] }[];
    results: {
      breaks: string[];
      finalists: string[];
      champions: string[];
    };
    warnings?: string[];
    inferredBreakCount?: number;
  }>(null);
  const [currentTournamentId, setCurrentTournamentId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  
  const [aliases, setAliases] = useState<any[]>([]);
  const [aliasSource, setAliasSource] = useState("");
  const [aliasTarget, setAliasTarget] = useState("");
  const [aliasLoading, setAliasLoading] = useState(false);

  const [unrankedSpeakers, setUnrankedSpeakers] = useState<Speaker[]>([]);
  const [activeMainTab, setActiveMainTab] = useState<"tournaments" | "unranked" | "aliases">("tournaments");

  // ── Manuel Turnuva Wizard ──────────────────────────────────────────────
  const [addMode, setAddMode] = useState<"tabbycat" | "manual">("tabbycat");
  const [manualStep, setManualStep] = useState(0); // 0=name, 1=speakerTab, 2=teamTab, 3=finals, 4=preview
  const [manualName, setManualName] = useState("");
  const [manualNumRounds, setManualNumRounds] = useState(5);
  const [manualSpeakerText, setManualSpeakerText] = useState("");
  const [manualTeamText, setManualTeamText] = useState("");
  const [manualParsedSpeakers, setManualParsedSpeakers] = useState<any[]>([]);
  const [manualParsedTeams, setManualParsedTeams] = useState<any[]>([]);
  const [manualParseWarnings, setManualParseWarnings] = useState<string[]>([]);
  const [manualFinalists, setManualFinalists] = useState<string[]>([]);
  const [manualChampion, setManualChampion] = useState("");
  const [manualBestSpeaker, setManualBestSpeaker] = useState("");
  const [manualPreview, setManualPreview] = useState<any[] | null>(null);
  const [manualTournamentId, setManualTournamentId] = useState<string | null>(null);

  const [aliasClusters, setAliasClusters] = useState<AliasCluster[]>([]);
  const [mergeSelections, setMergeSelections] = useState<Record<string, { main: string, subs: string[] }>>({});
  const [isMerging, setIsMerging] = useState(false);

  // Snapshot state
  const [snapshots, setSnapshots] = useState<{ id: string; label: string; created_at: string }[]>([]);
  const [showSnapshotPanel, setShowSnapshotPanel] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authed) {
      loadTournaments();
      loadAliases();
      loadUnrankedSpeakers();
    }
  }, [authed]);

  async function checkAuth() {
    try {
      // API call to test if cookie is present and valid
      const res = await fetch("/api/admin/aliases");
      if (res.ok) {
        setAuthed(true);
      } else {
        setAuthed(false);
      }
    } catch {}
  }

  async function loadAliases() {
    try {
      const res = await fetch("/api/admin/aliases");
      const data = await res.json();
      if (data.aliases) setAliases(data.aliases);
    } catch(e) { console.error("Could not load aliases"); }
  }

  async function loadTournaments() {
    const { data } = await supabase
      .from("tournaments")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTournaments(data);
  }

  async function loadUnrankedSpeakers() {
    const { data } = await supabase
      .from("speakers")
      .select("*")
      .lt("total_tournaments", 4)
      .or("force_ranked.is.null,force_ranked.eq.false")
      .order("elo", { ascending: false });
    if (data) setUnrankedSpeakers(data);
  }

  async function handleForceRank(speakerId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/force-rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerId })
      });
      if (res.ok) {
        setUnrankedSpeakers(prev => prev.filter(s => s.id !== speakerId));
        setStatus("Konuşmacı başarıyla Ranked yapıldı.");
        setTimeout(() => setStatus(""), 3000);
      } else {
        const data = await res.json();
        alert(data.error || "Hata oluştu.");
      }
    } catch (err) {
      alert("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      if (res.ok) {
        setAuthed(true);
      } else {
        setLoginError(data.error || "Giriş başarısız.");
      }
    } catch {
      setLoginError("Sunucu bağlantı hatası.");
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {}
    setAuthed(false);
  }

  async function findPotentialAliases() {
    setAliasLoading(true);
    setAliasClusters([]);
    setMergeSelections({});
    try {
      const res = await fetch("/api/admin/aliases/suggestions");
      const { clusters } = await res.json();
      setAliasClusters(clusters || []);
      
      const initial: Record<string, { main: string, subs: string[] }> = {};
      (clusters || []).forEach((c: AliasCluster) => {
        if (c.items.length > 0) {
           const main = c.items[0].name;
           initial[c.id] = { main, subs: [] }; // subs boş — kullanıcı seçecek
        }
      });
      setMergeSelections(initial);
    } catch(e) { console.error(e); }
    finally { setAliasLoading(false); }
  }

  async function handleBulkMergeAndRecalculate() {
    if (!confirm("Eşleşen isimler kaydedilip TÜM HESAPLAMALAR sıfırlanacaktır. Kendi istediğiniz kronolojik sıraya göre yeniden analiz etmeniz gerekecektir. Onaylıyor musunuz?")) return;
    
    const payload: { source_name: string; target_name: string }[] = [];
    Object.keys(mergeSelections).forEach(clusterId => {
      const selection = mergeSelections[clusterId];
      if (selection && selection.main && selection.subs.length > 0) {
         selection.subs.forEach(sub => {
            payload.push({ source_name: sub, target_name: selection.main });
         });
      }
    });

    if (payload.length === 0) {
      alert("Seçilmiş veya birleştirilmiş isim yok!");
      return;
    }

    setIsMerging(true);
    try {
      const res = await fetch("/api/admin/aliases/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("İsimler kaydedilirken hata oluştu");

      setStatus("İsimler kaydedildi. Veritabanı sıfırlanıyor...");
      
      const rRes = await fetch("/api/admin/reset", { method: "POST" });
      if (!rRes.ok) throw new Error("Veritabanı sıfırlanamadı!");

      await loadAliases();
      
      setStatus("İsimler başarıyla entegre edildi ve hesaplamalar sıfırlandı! Aşşağıdaki listeden turnuvaları sırasıyla analiz edebilirsiniz.");
      loadTournaments();

    } catch (e: any) {
      alert(e.message || "Toplu işlem hatası");
    } finally {
      setIsMerging(false);
      setAliasClusters([]);
      setStatus("Tüm entegrasyon tamamlandı!");
      setTimeout(() => setStatus(""), 3000);
    }
  }

  async function handleAddAlias(e: React.FormEvent) {
    e.preventDefault();
    setAliasLoading(true);
    try {
      const res = await fetch("/api/admin/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_name: aliasSource.trim(), target_name: aliasTarget.trim() })
      });
      if (res.ok) {
         setAliasSource("");
         setAliasTarget("");
         loadAliases();
      } else {
         const d = await res.json();
         alert(d.error || "Hata oluştu.");
      }
    } catch (e) { alert("Bağlantı hatası."); }
    setAliasLoading(false);
  }

  async function handleDeleteAlias(id: string) {
    if (!confirm("Bu eşleştirmeyi silmek istediğinize emin misiniz?")) return;
    setAliasLoading(true);
    try {
       await fetch(`/api/admin/aliases?id=${id}`, { method: "DELETE" });
       loadAliases();
    } catch {}
    setAliasLoading(false);
  }

  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [processPreview, setProcessPreview] = useState<any[] | null>(null);
  const [overrideBreaks, setOverrideBreaks] = useState<Record<string, boolean>>({});
  const [expandedSpeakers, setExpandedSpeakers] = useState<Set<string>>(new Set());
  const toggleSpeakerExpand = (id: string) => setExpandedSpeakers(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  // Editable sheet
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [breakCountInput, setBreakCountInput] = useState("");
  const [editableData, setEditableData] = useState<EditableData | null>(null);
  const [activeRoundTab, setActiveRoundTab] = useState(0);

  async function handleScrape(e?: React.FormEvent, url?: string, bCount?: string) {
    if (e) e.preventDefault();
    const targetUrl = url || tournamentUrl;
    const targetBreak = bCount || breakCount;
    
    setLoading(true);
    setScrapePreview(null);
    setStatus(`🔍 Tabbycat sayfaları taranıyor: ${targetUrl}`);

    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: targetUrl, breakCount: targetBreak }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(`❌ Hata: ${data.error}`);
        return null;
      }

      setScrapePreview(data);
      // Trigger break-count dialog instead of processing immediately
      setShowBreakDialog(true);
      setBreakCountInput(String(data.inferredBreakCount || ""));
      
      // Save tournament to DB
      const cleanUrl = targetUrl.endsWith("/") ? targetUrl : targetUrl + "/";
      const { data: tournament, error: insertError } = await supabase
        .from("tournaments")
        .upsert(
          { 
            name: data.tournamentName, 
            base_url: cleanUrl, 
            status: "pending",
            raw_data: {
              speakers: data.speakers,
              teams: data.teams,
              results: data.results,
              breakCount: data.inferredBreakCount || null,
              overrideBreaks: {},
            }
          },
          { onConflict: "base_url" }
        )
        .select()
        .single();

      if (insertError) {
        setStatus(`⚠️ Tara başarılı ancak Veritabanı Hatası: ${insertError.message}`);
        return null;
      } else if (tournament) {
        setCurrentTournamentId(tournament.id);
        setStatus(`✅ Tara tamamlandı! ${data.speakers.length} konuşmacı bulundu.`);
        return { tournamentId: tournament.id, ...data };
      }
    } catch {
      setStatus("❌ Ağ hatası: API'ye bağlanılamadı.");
    } finally {
      if (!syncProgress) setLoading(false);
    }
    return null;
  }

  async function handlePreview() {
    if (!currentTournamentId) { setStatus("❌ Önce turnuvayı tarayın."); return; }
    // Use editableData if available, else fallback to raw scrapePreview
    const dataToUse = editableData && scrapePreview ? reconstructScrapeData(editableData, scrapePreview) : scrapePreview;
    if (!dataToUse) { setStatus("❌ Veri bulunamadı."); return; }
    setLoading(true);
    setStatus("🔍 Önizleme hesaplanıyor...");
    try {
      const res = await fetch("/api/admin/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: currentTournamentId,
          speakers: dataToUse.speakers,
          teams: dataToUse.teams,
          results: dataToUse.results,
          breakCount: breakCountInput || breakCount || dataToUse.inferredBreakCount,
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(`❌ Önizleme hatası: ${data.error}`); return; }
      const initial: Record<string, boolean> = {};
      for (const sp of data.speakers || []) initial[sp.speakerId] = sp.didBreak;
      setOverrideBreaks(initial);
      setProcessPreview(data.speakers || []);
      setStatus("✅ Önizleme hazır. Break tespitlerini kontrol edin ve onaylayın.");
    } catch { setStatus("❌ Önizleme sırasında hata oluştu."); }
    finally { setLoading(false); }
  }

  async function handleSaveDraft() {
    if (!currentTournamentId) { setStatus("❌ Önce turnuvayı seçin."); return; }
    const dataToUse = editableData && scrapePreview ? reconstructScrapeData(editableData, scrapePreview) : scrapePreview;
    if (!dataToUse) { setStatus("❌ Veri bulunamadı."); return; }
    setLoading(true);
    setStatus("💾 Taslak kaydediliyor...");
    try {
      const { error } = await supabase
        .from("tournaments")
        .update({
          raw_data: {
            speakers: dataToUse.speakers,
            teams: dataToUse.teams,
            results: dataToUse.results,
            breakCount: breakCountInput || breakCount || dataToUse.inferredBreakCount || null,
            overrideBreaks: overrideBreaks || {},
          }
        })
        .eq("id", currentTournamentId);
        
      if (error) throw new Error(error.message);
      
      setStatus("✅ Taslak başarıyla kaydedildi!");
      setTimeout(() => setStatus(""), 3000);
      loadTournaments();
    } catch (e: any) {
      setStatus(`❌ Taslak kaydedilirken hata: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize() {
    if (!currentTournamentId) return;
    const dataToUse = editableData && scrapePreview ? reconstructScrapeData(editableData, scrapePreview) : scrapePreview;
    if (!dataToUse) return;
    setLoading(true);
    setStatus("⚙️ ELO hesaplanıyor ve kaydediliyor...");
    try {
      const res = await fetch("/api/admin/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: currentTournamentId,
          speakers: dataToUse.speakers,
          teams: dataToUse.teams,
          results: dataToUse.results,
          breakCount: breakCountInput || breakCount || dataToUse.inferredBreakCount,
          dryRun: false,
          overrideBreaks,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(`❌ İşlem hatası: ${data.error}`); return; }
      setStatus(`🏆 İşlendi! ${data.processed} konuşmacı güncellendi.`);
      setScrapePreview(null); setProcessPreview(null); setOverrideBreaks({});
      setEditableData(null); setActiveRoundTab(0); setBreakCountInput("");
      setTournamentUrl(""); setBreakCount(""); setCurrentTournamentId(null);
      loadTournaments();
    } catch { setStatus("❌ İşlem sırasında hata oluştu."); }
    finally { setLoading(false); }
  }

  async function handleProcess(previewData?: any, tId?: string) {
    const targetPreview = previewData || scrapePreview;
    const targetId = tId || currentTournamentId;

    if (!targetPreview || !targetId) {
      if (!syncProgress) setStatus("❌ İşlem hatası: Eksik veri.");
      return false;
    }

    setLoading(true);
    if (!syncProgress) setStatus("⚙️ ELO hesaplanıyor...");

    try {
      const res = await fetch("/api/admin/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: targetId,
          speakers: targetPreview.speakers,
          teams: targetPreview.teams,
          results: targetPreview.results,
          breakCount: breakCount || targetPreview.inferredBreakCount,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(`❌ İşlem hatası: ${data.error}`);
        return false;
      }

      if (!syncProgress) {
        setStatus(`🏆 İşlendi! ${data.processed} konuşmacı güncellendi.`);
        setScrapePreview(null);
        setTournamentUrl("");
        setBreakCount("");
        setCurrentTournamentId(null);
        loadTournaments();
      }
      return true;
    } catch {
      setStatus("❌ İşlem sırasında hata oluştu.");
      return false;
    } finally {
      if (!syncProgress) setLoading(false);
    }
  }

  async function handleBulkSync(chronological: boolean = false) {
    if (!chronological) {
      if (!confirm(`${tournaments.length} turnuva için tüm ELO'lar yeniden hesaplanacak. Emin misiniz?`)) return;
    }
    
    setLoading(true);
    setSyncProgress({ current: 0, total: tournaments.length });
    
    // Sort oldest first if doing a chronological bulk sync
    const targetTournaments = chronological
      ? [...tournaments].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      : tournaments;

    let successCount = 0;
    for (let i = 0; i < targetTournaments.length; i++) {
      const t = targetTournaments[i];
      setSyncProgress({ current: i + 1, total: targetTournaments.length });
      setStatus(`🔄 Senkronize ediliyor (${i + 1}/${targetTournaments.length}): ${t.name}`);
      
      const scraped = await handleScrape(undefined, t.base_url);
      if (scraped) {
        const processed = await handleProcess(scraped, scraped.tournamentId);
        if (processed) successCount++;
      }
    }
    
    setSyncProgress(null);
    setLoading(false);
    setStatus(`🏁 BİTTİ: ${successCount} turnuva başarıyla güncellendi.`);
    loadTournaments();
  }

  async function handleSingleSync(t: Tournament) {
    // Sadece tarama yapar ve break dialogunu açar.
    // handleProcess, kullanıcı tabloyu kontrol edip "Onayla & Kaydet" butonuna bastıktan sonra tetiklenir.
    setTournamentUrl(t.base_url);
    setCurrentTournamentId(t.id);
    await handleScrape(undefined, t.base_url);
  }

  async function handleDeleteTournament(t: Tournament) {
    if (!confirm(`DİKKAT! "${t.name}" adlı turnuvayı ve ilgili tüm verilerini (ELO değişimleri, round kayıtları vb.) kalıcı olarak silmek istediğinize emin misiniz?`)) return;
    setLoading(true);
    setStatus(`🗑️ "${t.name}" siliniyor...`);
    try {
      const res = await fetch("/api/admin/delete-tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: t.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setStatus(`✅ "${t.name}" başarıyla silindi. (Hesaplamaları senkronize etmek için 'Hesaplamaları Sıfırla' ve 'Tümünü Yeniden Analiz Et' işlemlerini yapmanız önerilir.)`);
      loadTournaments();
    } catch (e: any) {
      setStatus("❌ İşlem hatası: " + e.message);
    }
    setLoading(false);
  }

  async function handleResetDb() {
    if (!confirm("DİKKAT! Tüm hesaplamalar (Elo, H2H, Turnuva geçmişi) sıfırlanacaktır. Turnuva linkleri ve ham veriler sabit kalır. Emin misiniz?")) return;
    
    setLoading(true);
    setStatus("⚠️ Hesaplamalar sıfırlanıyor...");
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setStatus("✅ Hesaplamalar başarıyla sıfırlandı. 'Tümünü Yeniden Analiz Et' ile tek tıkta hepsini yeniden hesaplayabilirsiniz.");
      loadTournaments();
    } catch (e: any) {
      setStatus("❌ İşlem hatası: " + e.message);
    }
    setLoading(false);
  }

  // Tek turnuvayı kayıtlı ham veriyle yeniden analiz et
  async function handleReprocess(t: Tournament) {
    if (!t.raw_data) {
      setStatus(`❌ ${t.name} için kayıtlı veri yok. Önce bu turnuvayı tarıyın ve onaylayın.`);
      return false;
    }

    // Load raw data into the editable preview UI so user can inspect/correct before processing
    const rd = t.raw_data as any;
    setCurrentTournamentId(t.id);

    // Build a synthetic scrapePreview from raw_data
    const syntheticPreview = {
      tournamentName: t.name,
      speakers: rd.speakers || [],
      teams: rd.teams || [],
      results: rd.results || { rooms: [], breaks: [], finalists: [], champions: [], bestSpeakers: [] },
      warnings: [],
      inferredBreakCount: rd.breakCount || rd.results?.breaks?.length || 0,
    };
    setScrapePreview(syntheticPreview);

    // Populate break count input and open the editable sheet
    const inferredCount = rd.breakCount || rd.results?.breaks?.length || 0;
    setBreakCountInput(String(inferredCount));
    setEditableData(buildEditableData(syntheticPreview, inferredCount));
    setActiveRoundTab(0);

    // Scroll to the editable sheet
    setStatus(`📋 ${t.name} verisi yüklendi. Kontrol edip ELO Önizle butonuna basın.`);
    return true;
  }

  // Kayıtlı ham verisi olan tüm turnuvaları kronolojik sırayla yeniden analiz et
  async function handleBulkReprocess() {
    const withData = [...tournaments]
      .filter(t => t.raw_data)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (withData.length === 0) {
      setStatus("❌ Kayıtlı ham verisi olan turnuva yok. Önce turnuvaları tarıyın ve onaylayın.");
      return;
    }

    if (!confirm(`${withData.length} turnuva kronolojik sırayla yeniden analiz edilecek. Emin misiniz?`)) return;

    setLoading(true);
    setSyncProgress({ current: 0, total: withData.length });
    let successCount = 0;

    for (let i = 0; i < withData.length; i++) {
      const t = withData[i];
      setSyncProgress({ current: i + 1, total: withData.length });
      setStatus(`🔄 Yeniden analiz (${i + 1}/${withData.length}): ${t.name}`);

      try {
        const res = await fetch("/api/admin/reprocess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentId: t.id }),
        });
        const data = await res.json();
        if (res.ok) successCount++;
        else console.error(`${t.name} hatası:`, data.error);
      } catch (e) {
        console.error(`${t.name} exception:`, e);
      }
    }

    setSyncProgress(null);
    setLoading(false);
    setStatus(`🏁 BİTTİ: ${successCount}/${withData.length} turnuva başarıyla yeniden analiz edildi.`);
    loadTournaments();
  }


  async function handleDeleteAllData() {
    if (!confirm("DİKKAT! Tüm veritabanı SİLİNECEKTİR (Turnuvalar, Konuşmacılar, Geçmiş vs). Bu işlem geri alınamaz ve her şeye sıfırdan başlamanız gerekir. Emin misiniz?")) return;
    
    setLoading(true);
    setStatus("⚠️ Tüm veriler siliniyor...");
    try {
      const res = await fetch("/api/admin/delete-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setStatus("✅ Bütün veriler kalıcı olarak silindi. Yepyeni bir sayfa açıldı!");
      loadTournaments();
      loadAliases();
    } catch (e: any) {
      setStatus("❌ İşlem hatası: " + e.message);
    }
    setLoading(false);
  }

  async function loadSnapshots() {
    try {
      const res = await fetch("/api/admin/snapshot");
      const data = await res.json();
      if (data.snapshots) setSnapshots(data.snapshots);
    } catch {}
  }

  async function handleTakeSnapshot() {
    const label = `Snapshot — ${new Date().toLocaleString("tr-TR")}`;
    setLoading(true);
    setStatus("📸 Snapshot alınıyor...");
    try {
      const res = await fetch("/api/admin/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus(`✅ Snapshot alındı: ${data.speakers} konuşmacı, ${data.eloHistory} ELO kaydı, ${data.tournamentStats} turnuva istatistiği yedeklendi.`);
      loadSnapshots();
    } catch (e: any) {
      setStatus("❌ Snapshot alınamadı: " + e.message);
    }
    setLoading(false);
  }

  async function handleRestoreSnapshot(snapshotId: string, label: string) {
    if (!confirm(`"${label}" snapshot'ından geri yüklenecek. Mevcut hesaplamalar üzerine yazılacak. Emin misiniz?`)) return;
    setLoading(true);
    setStatus("🔄 Snapshot'tan geri yükleniyor...");
    try {
      const res = await fetch("/api/admin/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus(`✅ Geri yüklendi! ${data.restored?.speakers} konuşmacı, ${data.restored?.eloHistory} ELO kaydı, ${data.restored?.tournamentStats} turnuva istatistiği geri yüklendi.`);
      loadTournaments();
    } catch (e: any) {
      setStatus("❌ Geri yükleme hatası: " + e.message);
    }
    setLoading(false);
  }

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="glass rounded-2xl p-8 w-full max-w-md glow-indigo">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-3xl mx-auto mb-4 shadow-lg shadow-indigo-500/40">
              🔐
            </div>
            <h1 className="text-2xl font-bold text-white">Admin Paneli</h1>
            <p className="text-gray-400 text-sm mt-1">
              Turnuva yönetimi için giriş yapın
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                placeholder="kullanıcı adı"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                placeholder="şifre"
                required
              />
            </div>
            {loginError && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/30 active:scale-95"
            >
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Admin Paneli</h1>
          <p className="text-gray-400 mt-1">Turnuva yönetimi ve ELO işlemleri</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition"
        >
          Çıkış Yap
        </button>
      </div>

      {/* Main Tabs Container */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveMainTab("tournaments")}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2 outline-none ${
            activeMainTab === "tournaments" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-lg shadow-indigo-500/10" : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
          }`}
        >
          <span>🌐</span> Turnuva Ekle ve Analiz Et
        </button>
        <button
          onClick={() => setActiveMainTab("unranked")}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2 outline-none ${
            activeMainTab === "unranked" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-lg shadow-indigo-500/10" : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
          }`}
        >
          <span>⚡</span> Manuel Sıralama
        </button>
        <button
          onClick={() => setActiveMainTab("aliases")}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2 outline-none ${
            activeMainTab === "aliases" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-lg shadow-indigo-500/10" : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
          }`}
        >
          <span>👥</span> İsim Birleştirme
        </button>
      </div>

      {activeMainTab === "tournaments" && (
        <div className="space-y-8">

          {/* Mode Toggle */}
          <div className="flex gap-3">
            <button onClick={() => setAddMode("tabbycat")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition flex items-center justify-center gap-2 ${addMode === "tabbycat" ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"}` }>
              🌐 Tabbycat Linki
            </button>
            <button onClick={() => setAddMode("manual")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition flex items-center justify-center gap-2 ${addMode === "manual" ? "bg-violet-500/20 text-violet-300 border-violet-500/30" : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"}`}>
              📋 Manuel Tab Girişi
            </button>
          </div>

          {/* Add Tournament — Tabbycat */}
          {addMode === "tabbycat" && (
          <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">🌐</span> Yeni Turnuva Ekle
        </h2>
        <form onSubmit={handleScrape} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            value={tournamentUrl}
            onChange={(e) => setTournamentUrl(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono text-sm"
            placeholder="https://tab.tabcim.com.tr/turnuva2024/"
            required
          />
          <input
            type="number"
            min="0"
            max="128"
            value={breakCount}
            onChange={(e) => setBreakCount(e.target.value)}
            className="w-full sm:w-36 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono text-sm"
            placeholder="Break Sayısı"
            title="Kaç takımın break yaptığını (opsiyonel) manuel girebilirsiniz. En üstteki takımlar break yapmış sayılır."
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 whitespace-nowrap"
          >
            {loading ? "Taranıyor..." : "🔍 Tara"}
          </button>
        </form>

      </div>
          )} {/* end addMode === tabbycat */}

          {/* ── Manuel Turnuva Wizard ── */}
          {addMode === "manual" && (
            <ManualTournamentWizard
              loading={loading}
              setLoading={setLoading}
              setStatus={setStatus}
              onDone={() => { loadTournaments(); setAddMode("tabbycat"); }}
            />
          )}

        {/* Global Status Message */}
        {status && (
          <div
            className={`mt-4 px-4 py-3 rounded-lg text-sm border ${
              status.startsWith("❌")
                ? "bg-red-500/10 border-red-500/20 text-red-300"
                : status.startsWith("✅") || status.startsWith("🏆")
                ? "bg-green-500/10 border-green-500/20 text-green-300"
                : "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
            }`}
          >
            {status}
          </div>
        )}

      {/* ── Break Count Dialog ── */}
      {showBreakDialog && scrapePreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-8 w-full max-w-sm glow-indigo text-center space-y-6">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-indigo-500/40">⚡</div>
            <div>
              <h3 className="text-xl font-bold text-white">{scrapePreview.tournamentName}</h3>
              <p className="text-gray-400 text-sm mt-1">Bu turnuvada kaç takım break yaptı?</p>
            </div>
            {(scrapePreview.inferredBreakCount || 0) > 0 && (
              <p className="text-indigo-300 text-xs bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
                🤖 Sistem {scrapePreview.inferredBreakCount} takımın break yaptığını otomatik tespit etti.
              </p>
            )}
            <input
              type="number" min="0" max="128" autoFocus
              value={breakCountInput}
              onChange={e => setBreakCountInput(e.target.value)}
              className="w-full bg-white/5 border border-indigo-500/40 rounded-xl px-4 py-3 text-white text-center text-2xl font-bold placeholder-gray-600 focus:outline-none focus:border-indigo-400 transition"
              placeholder="0"
              onKeyDown={e => { if (e.key === "Enter") { setShowBreakDialog(false); setEditableData(buildEditableData(scrapePreview, Number(breakCountInput))); setActiveRoundTab(0); } }}
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowBreakDialog(false); setScrapePreview(null); setBreakCountInput(""); }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm">
                İptal
              </button>
              <button onClick={() => { setShowBreakDialog(false); setEditableData(buildEditableData(scrapePreview, Number(breakCountInput))); setActiveRoundTab(0); }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/30 active:scale-95">
                Devam →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editable Tournament Sheet ── */}
      {editableData && !processPreview && (
        <div className="glass rounded-2xl overflow-hidden border border-indigo-500/20">
          {/* Header */}
          <div className="px-6 py-4 bg-indigo-500/10 border-b border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>📝</span> {editableData.tournamentName}
                <span className="text-xs font-normal text-indigo-400 bg-indigo-500/15 border border-indigo-500/20 px-2 py-0.5 rounded-full">Düzenleme Modu</span>
              </h2>
              <p className="text-gray-500 text-xs mt-0.5">
                Konuşmacı puanlarını, salon sıralamasını ve break takımlarını düzenleyin, ardından ELO hesaplayın.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditableData(null); setScrapePreview(null); setProcessPreview(null); setBreakCountInput(""); }}
                className="px-3 py-2 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm">
                ✕ İptal
              </button>
              <button onClick={handleSaveDraft} disabled={loading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition disabled:opacity-50 text-sm flex items-center gap-1">
                💾 Taslağı Kaydet
              </button>
              <button onClick={handlePreview} disabled={loading}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 text-sm">
                {loading ? "Hesaplanıyor..." : "🔍 ELO Önizle"}
              </button>
            </div>
          </div>

          {/* Break count strip */}
          <div className="px-6 py-2 bg-black/20 border-b border-white/5 flex items-center gap-3 text-sm">
            <span className="text-gray-500">⚡ Break Sayısı:</span>
            <input type="number" min="0" max="128" value={breakCountInput}
              onChange={e => {
                setBreakCountInput(e.target.value);
                // Recompute break teams in editableData
                const cnt = Number(e.target.value);
                if (!isNaN(cnt) && scrapePreview) {
                  const topTeams = scrapePreview.teams.slice(0, cnt).map((t: any) => t.name.toLowerCase());
                  setEditableData(prev => prev ? { ...prev, breakTeams: topTeams } : prev);
                }
              }}
              className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-center font-mono focus:outline-none focus:border-indigo-500 transition"
            />
            <span className="text-gray-600 text-xs">Takım sayısı (Break Yapanlar sekmesinden de düzenleyebilirsiniz)</span>
          </div>

          {/* Round tab bar */}
          <div className="flex overflow-x-auto border-b border-white/10 bg-black/10">
            {editableData.rounds.map((r, ri) => (
              <button key={ri} onClick={() => setActiveRoundTab(ri)}
                className={`px-4 py-3 text-sm whitespace-nowrap transition border-b-2 font-medium ${
                  activeRoundTab === ri
                    ? "border-indigo-500 text-indigo-300 bg-indigo-500/10"
                    : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5"
                }`}>
                {r.isOutround ? "🏆 " : "#"}{ri + 1} {r.name}
              </button>
            ))}
            <button onClick={() => setActiveRoundTab(editableData.rounds.length)}
              className={`px-4 py-3 text-sm whitespace-nowrap transition border-b-2 font-medium ${
                activeRoundTab === editableData.rounds.length
                  ? "border-green-500 text-green-300 bg-green-500/10"
                  : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}>⚡ Break Yapanlar</button>
            <button onClick={() => setActiveRoundTab(editableData.rounds.length + 1)}
              className={`px-4 py-3 text-sm whitespace-nowrap transition border-b-2 font-medium ${
                activeRoundTab === editableData.rounds.length + 1
                  ? "border-purple-500 text-purple-300 bg-purple-500/10"
                  : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}>🎙️ Konuşmacılar</button>
          </div>

          {/* ── ROUND TAB ── */}
          {activeRoundTab < editableData.rounds.length && (() => {
            const round = editableData.rounds[activeRoundTab];
            return (
              <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto">
                {round.isOutround && (
                  <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 px-4 py-2 rounded-lg text-xs flex items-start gap-2">
                    <span className="mt-0.5">🏆</span>
                    <span>
                      <strong>Eleme turu</strong> — SP verisi yoksa sistem SP farkı = 0 kabul ederek
                      {" "}<strong>Gelişim/Kayıp modunu</strong> otomatik işletir.
                      İstersen SP puanlarını manuel girebilirsin; girersen Performans Modu devreye girebilir.
                    </span>
                  </div>
                )}
                {round.rooms.map((room, roomIdx) => {
                  const spDiffs: number[] = room.teams.map(t => {
                    if (t.speakers.length < 2) return 0;
                    return Math.abs(t.speakers[0].sp - t.speakers[1].sp);
                  });
                  const maxDiff = Math.max(...spDiffs);
                  return (
                    <div key={room.id} className="bg-white/3 rounded-xl overflow-hidden border border-white/5">
                      {/* Salon header */}
                      <div className="flex items-center gap-3 px-4 py-2.5 bg-white/5 border-b border-white/5">
                        <span className="text-gray-500 text-xs">Salon:</span>
                        <input value={room.label} onChange={e => {
                          const v = e.target.value;
                          setEditableData(prev => { if (!prev) return prev;
                            const nd = { ...prev, rounds: [...prev.rounds] };
                            nd.rounds[activeRoundTab] = { ...round, rooms: round.rooms.map((r, ri) => ri === roomIdx ? { ...r, label: v } : r) };
                            return nd; });
                        }} className="bg-transparent text-white text-sm font-medium focus:outline-none border-b border-transparent focus:border-indigo-500 transition px-1 min-w-0 w-40" />
                        <span className="ml-auto text-xs text-gray-600">{room.teams.length} takım</span>
                      </div>
                      {/* Team rows */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-600 uppercase tracking-wider border-b border-white/5">
                              <th className="px-3 py-2 text-center w-8">Sıra</th>
                              <th className="px-3 py-2 text-left">Takım</th>
                              <th className="px-3 py-2 text-center">Konuşmacı 1</th>
                              <th className="px-3 py-2 text-center">SP</th>
                              <th className="px-3 py-2 text-center">Konuşmacı 2</th>
                              <th className="px-3 py-2 text-center">SP</th>
                              <th className="px-3 py-2 text-center">Toplam</th>
                              <th className="px-3 py-2 text-center">Fark</th>
                              <th className="px-3 py-2 text-center w-14">Sıra↕</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...room.teams].sort((a, b) => a.position - b.position).map((team, ti) => {
                              const total = team.speakers.reduce((s, sp) => s + sp.sp, 0);
                              const diff = team.speakers.length >= 2 ? Math.abs(team.speakers[0].sp - team.speakers[1].sp) : 0;
                              const posEmoji = ["🥇", "🥈", "🥉", "4."][Math.min(team.position - 1, 3)];
                              const updateSp = (spIdx: number, val: number) => {
                                setEditableData(prev => { if (!prev) return prev;
                                  const nd = { ...prev, rounds: [...prev.rounds] };
                                  nd.rounds[activeRoundTab] = { ...round, rooms: round.rooms.map((r, ri) => ri === roomIdx ? { ...r, teams: r.teams.map(t => t.position === team.position ? { ...t, speakers: t.speakers.map((s, si) => si === spIdx ? { ...s, sp: val } : s) } : t) } : r) };
                                  return nd; });
                              };
                              const moveTeam = (dir: -1 | 1) => {
                                setEditableData(prev => { if (!prev) return prev;
                                  const nd = { ...prev, rounds: [...prev.rounds] };
                                  const updRooms = round.rooms.map((r, ri) => {
                                    if (ri !== roomIdx) return r;
                                    const sorted = [...r.teams].sort((a, b) => a.position - b.position);
                                    const idx = sorted.findIndex(t => t.position === team.position);
                                    const swapIdx = idx + dir;
                                    if (swapIdx < 0 || swapIdx >= sorted.length) return r;
                                    const newTeams = sorted.map((t, i) => {
                                      if (i === idx) return { ...t, position: sorted[swapIdx].position };
                                      if (i === swapIdx) return { ...t, position: sorted[idx].position };
                                      return t;
                                    });
                                    return { ...r, teams: newTeams };
                                  });
                                  nd.rounds[activeRoundTab] = { ...round, rooms: updRooms };
                                  return nd; });
                              };
                              return (
                                <tr key={team.position} className={`border-b border-white/5 ${team.position === 1 ? "bg-yellow-500/5" : team.position === 4 ? "bg-red-500/5" : ""}` }>
                                  <td className="px-3 py-2.5 text-center font-bold text-sm">{posEmoji}</td>
                                  <td className="px-3 py-2.5 font-medium text-white max-w-[120px] truncate">{team.teamName}</td>
                                  <td className="px-3 py-2.5 text-center text-gray-400">{team.speakers[0]?.name ?? "—"}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    <input type="number" min="0" max="1000" value={team.speakers[0]?.sp ?? 0}
                                      onChange={e => updateSp(0, Number(e.target.value))}
                                      className={"w-16 bg-white/5 border rounded px-2 py-1 text-white text-center font-mono text-xs focus:outline-none focus:border-indigo-500 " + (round.isOutround ? "border-white/5 text-gray-500 italic" : "border-white/10")} />
                                  </td>
                                  <td className="px-3 py-2.5 text-center text-gray-400">{team.speakers[1]?.name ?? "—"}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    <input type="number" min="0" max="1000" value={team.speakers[1]?.sp ?? 0}
                                      onChange={e => updateSp(1, Number(e.target.value))}
                                      className={"w-16 bg-white/5 border rounded px-2 py-1 text-white text-center font-mono text-xs focus:outline-none focus:border-indigo-500 " + (round.isOutround ? "border-white/5 text-gray-500 italic" : "border-white/10")} />
                                  </td>
                                  <td className="px-3 py-2.5 text-center font-mono font-bold text-indigo-400">{total > 0 ? total : "—"}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    {(
                                      <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${ diff > 1 ? "text-blue-400 bg-blue-500/15" : "text-purple-400 bg-purple-500/15" }`}>
                                        {diff > 1 ? `▲${diff}` : diff === 0 ? "0" : `${diff}` }
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    <div className="flex flex-col gap-0.5 items-center">
                                      <button onClick={() => moveTeam(-1)} className="text-gray-600 hover:text-white text-xs leading-none transition">▲</button>
                                      <button onClick={() => moveTeam(1)} className="text-gray-600 hover:text-white text-xs leading-none transition">▼</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* SP diff analysis */}
                      {!round.isOutround && maxDiff > 1 && (
                        <div className="px-4 py-2 border-t border-white/5 text-xs text-blue-400/70">
                          📊 En yüksek SP farkı: <strong className="text-blue-400">{maxDiff}</strong> puan → Performans Modu tetiklendi
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── BREAK TEAMS TAB ── */}
          {activeRoundTab === editableData.rounds.length && (
            <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
              <p className="text-gray-500 text-xs">Break yapan takımları işaretleyin. Seçili takım üyelerine +5 Elo break bonusu verilir.</p>
              {scrapePreview?.teams?.map((t: any, ti: number) => {
                const isBreak = editableData.breakTeams.some(b => b === t.name.toLowerCase() || b.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(b));
                return (
                  <div key={ti} onClick={() => {
                    setEditableData(prev => {
                      if (!prev) return prev;
                      const tl = t.name.toLowerCase();
                      const already = prev.breakTeams.includes(tl);
                      return { ...prev, breakTeams: already ? prev.breakTeams.filter(b => b !== tl) : [...prev.breakTeams, tl] };
                    });
                  }} className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition ${
                    isBreak ? "border-green-500/30 bg-green-500/10" : "border-white/5 bg-white/3 hover:bg-white/5"
                  }`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
                      isBreak ? "border-green-500 bg-green-500" : "border-gray-600 bg-transparent"
                    }`}>{isBreak && <span className="text-white text-xs font-bold">✓</span>}</div>
                    <div className="flex-1">
                      <div className="text-white text-sm font-medium">{t.name}</div>
                      <div className="text-gray-500 text-xs">{t.speakers?.join(" & ")}</div>
                    </div>
                    {isBreak && <span className="text-green-400 text-xs px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/20">+5 Elo</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SPEAKERS TAB ── */}
          {activeRoundTab === editableData.rounds.length + 1 && (() => {
            const allSpeakers: { name: string; totalPoints: number; scores?: number[] }[] = scrapePreview?.speakers ?? [];
            const prelims = editableData.rounds.filter(r => !r.isOutround);
            const roundCount = prelims.length;
            const getSPTotal = (sp: { scores?: number[] }) => (sp.scores || []).reduce((a: number, b: number) => a + b, 0);
            const sorted = [...allSpeakers].sort((a, b) => getSPTotal(b) - getSPTotal(a));
            return (
              <div className="max-h-[65vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#0f172a] border-b border-white/10 z-10">
                    <tr className="text-gray-500 uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left">#</th>
                      <th className="px-3 py-2.5 text-left">Konuşmacı</th>
                      {prelims.map((r, ri) => (<th key={ri} className="px-3 py-2.5 text-center whitespace-nowrap">{r.name}</th>))}
                      <th className="px-3 py-2.5 text-right">Toplam</th>
                      <th className="px-3 py-2.5 text-right">Ort.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((sp, idx) => {
                      const scores: number[] = sp.scores || [];
                      const total = getSPTotal(sp);
                      const filled = scores.filter((s: number) => s > 0).length;
                      return (
                        <tr key={sp.name} className={"border-b border-white/5 " + (idx % 2 === 0 ? "bg-white/[0.02] " : "") + "hover:bg-white/5"}>
                          <td className="px-3 py-2.5 text-gray-600 text-center">{idx + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-white">{sp.name}</td>
                          {Array.from({ length: roundCount }, (_, ri) => (<td key={ri} className="px-3 py-2.5 text-center font-mono text-gray-400">{(scores[ri] ?? 0) > 0 ? scores[ri] : <span className="text-gray-700">—</span>}</td>))}
                          <td className="px-3 py-2.5 text-right font-mono text-indigo-400 font-bold">{total}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-400">{filled > 0 ? (total / filled).toFixed(1) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Process Preview Table (Break Toggle) — shown after handlePreview ── */}
      {editableData && processPreview && (
        <div className="glass rounded-2xl overflow-hidden border border-indigo-500/20">
          <div className="px-6 py-4 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <span className="font-semibold text-indigo-300">Elo Önizleme — Break tespitlerini düzeltin</span>
              <span className="text-xs text-gray-500 ml-2">Satıra tıklayarak tur detaylarını görebilirsiniz</span>
            </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setProcessPreview(null)} className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition">← Geri</button>
                <button onClick={handleFinalize} disabled={loading}
                  className="px-5 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 text-sm">
                  {loading ? "Kaydediliyor..." : "✅ Onayla & Kaydet"}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-gray-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left w-6"></th>
                    <th className="px-3 py-2 text-left">Konuşmacı</th>
                    <th className="px-3 py-2 text-right">Avg Prelim SP</th>
                    <th className="px-3 py-2 text-right">Elo Değişimi</th>
                    <th className="px-3 py-2 text-right">Elo Sonrası</th>
                    <th className="px-3 py-2 text-center">Break ✓</th>
                  </tr>
                </thead>
                <tbody>
                  {processPreview.map((sp: any) => {
                    const isExpanded = expandedSpeakers.has(sp.speakerId);
                    const rounds: any[] = sp.rounds || [];
                    return (
                      <React.Fragment key={sp.speakerId}>
                        {/* Main row */}
                        <tr
                          onClick={() => rounds.length > 0 && toggleSpeakerExpand(sp.speakerId)}
                          className={`border-b border-white/5 transition ${rounds.length > 0 ? "cursor-pointer hover:bg-indigo-500/5" : ""} ${isExpanded ? "bg-indigo-500/5" : ""}`}
                        >
                          <td className="px-3 py-2.5 text-center text-gray-500">
                            {rounds.length > 0 && (
                              <span className="text-[10px] transition-transform inline-block" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-white">{sp.name}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{sp.prelimSpeakAvg > 0 ? sp.prelimSpeakAvg.toFixed(1) : "—"}</td>
                          <td className={`px-3 py-2.5 text-right font-mono font-bold ${sp.eloChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {sp.eloChange >= 0 ? "+" : ""}{sp.eloChange}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-400 font-mono">{sp.eloAfter}</td>
                          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setOverrideBreaks(prev => ({ ...prev, [sp.speakerId]: !prev[sp.speakerId] }))}
                              className={`w-8 h-5 rounded-full transition-colors relative ${overrideBreaks[sp.speakerId] ? "bg-green-500" : "bg-white/10"}`}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${overrideBreaks[sp.speakerId] ? "left-3.5" : "left-0.5"}`} />
                            </button>
                          </td>
                        </tr>

                        {/* Expanded round breakdown */}
                        {isExpanded && rounds.length > 0 && (
                          <tr className="border-b border-indigo-500/10 bg-black/20">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="space-y-1">
                                <div className="grid grid-cols-5 gap-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-2 pb-1 border-b border-white/5">
                                  <span>Tur</span>
                                  <span className="text-center">Sıra</span>
                                  <span className="text-center">Mod</span>
                                  <span className="text-center">SP (Kendi / Partner)</span>
                                  <span className="text-right">Elo Δ</span>
                                </div>
                                {rounds.map((r: any, ri: number) => {
                                  const modLabel = r.distributionMode || "—";
                                  const modColor =
                                    modLabel.includes("performans") ? "text-blue-400" :
                                    modLabel.includes("outround") ? "text-amber-400" :
                                    modLabel.includes("gelisim") || modLabel.includes("gelişim") ? "text-purple-400" :
                                    modLabel.includes("kayip") || modLabel.includes("kayıp") ? "text-red-400" :
                                    "text-gray-400";
                                  const delta = r.eloChange ?? 0;
                                  const posEmoji = r.placement != null ? ["🥇","🥈","🥉","4️⃣"][Math.min(r.placement-1,3)] ?? r.placement : "—";
                                  return (
                                    <div key={ri} className={`grid grid-cols-5 gap-2 items-center px-2 py-1.5 rounded-lg ${r.isOutround ? "bg-amber-500/5 border border-amber-500/10" : "hover:bg-white/3"}`}>
                                      <span className="text-white font-medium truncate">
                                        {r.isOutround && <span className="mr-1">🏆</span>}{r.roundName}
                                      </span>
                                      <span className="text-center text-gray-300">{posEmoji}</span>
                                      <span className={`text-center text-[10px] font-medium ${modColor}`}>
                                        {modLabel.replace("outround-","").replace("gelisim","Gelişim").replace("performans","Performans").replace("kayip","Kayıp").replace("berabere","Berabere")}
                                      </span>
                                      <span className="text-center text-gray-400 font-mono">
                                        {r.ownSp != null ? r.ownSp : "—"} / {r.partnerSp != null ? r.partnerSp : "—"}
                                      </span>
                                      <span className={`text-right font-mono font-bold ${delta >= 0 ? "text-green-400" : "text-red-400"}`}>
                                        {delta >= 0 ? "+" : ""}{Math.round(delta * 10) / 10}
                                      </span>
                                    </div>
                                  );
                                })}
                                {/* Break bonus row */}
                                {overrideBreaks[sp.speakerId] && (
                                  <div className="grid grid-cols-5 gap-2 items-center px-2 py-1.5 rounded-lg bg-green-500/5 border border-green-500/10">
                                    <span className="text-green-300 font-medium col-span-4">⚡ Break Bonusu</span>
                                    <span className="text-right font-mono font-bold text-green-400">+5</span>
                                  </div>
                                )}
                                {/* Best Speaker bonus row */}
                                {sp.isBestSpeaker && (
                                  <div className="grid grid-cols-5 gap-2 items-center px-2 py-1.5 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
                                    <span className="text-yellow-300 font-medium col-span-4">🌟 En İyi Konuşmacı Bonusu</span>
                                    <span className="text-right font-mono font-bold text-yellow-400">+15</span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </div>
      )}

      {/* Tournament List */}
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-2xl">🏆</span> Turnuvalar
            <span className="text-sm font-normal text-gray-400">
              ({tournaments.length} adet)
            </span>
          </h2>
          
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <button
              onClick={handleBulkReprocess}
              disabled={loading || tournaments.filter(t => t.raw_data).length === 0}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-semibold"
            >
              <span>⚡</span> Tümünü Yeniden Analiz Et
              <span className="text-xs opacity-60">({tournaments.filter(t => t.raw_data).length} hazır)</span>
            </button>
            <button
              onClick={() => handleBulkSync(false)}
              disabled={loading || tournaments.length === 0}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
            >
              <span>🔄</span> Toplu Tarama+Analiz
            </button>
            <button
              onClick={handleResetDb}
              disabled={loading || tournaments.length === 0}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-semibold"
            >
              <span>💣</span> Hesaplamaları Sıfırla
            </button>
            <button
              onClick={handleDeleteAllData}
              disabled={loading || tournaments.length === 0}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-semibold"
            >
              <span>🗑️</span> Tüm Verileri Sil
            </button>
            <button
              onClick={() => { setShowSnapshotPanel(v => !v); if (!showSnapshotPanel) loadSnapshots(); }}
              disabled={loading}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-semibold"
            >
              <span>📸</span> Snapshot
            </button>
          </div>
        </div>

        {/* Snapshot Panel */}
        {showSnapshotPanel && (
          <div className="mb-6 glass rounded-2xl p-4 border border-cyan-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-cyan-400">📸 Yedekleme / Geri Yükleme</span>
              <button
                onClick={handleTakeSnapshot}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition text-sm font-semibold disabled:opacity-50"
              >
                ⚡ Şimdi Snapshot Al
              </button>
            </div>
            {snapshots.length === 0 ? (
              <p className="text-gray-500 text-xs text-center py-2">Henüz snapshot yok. Tüm turnuvalar işlenince &quot;Snapshot Al&quot; basın.</p>
            ) : (
              <div className="space-y-2">
                {snapshots.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-white/3 rounded-xl px-4 py-2.5">
                    <div>
                      <div className="text-sm text-white">{s.label}</div>
                      <div className="text-xs text-gray-500">{new Date(s.created_at).toLocaleString("tr-TR")}</div>
                    </div>
                    <button
                      onClick={() => handleRestoreSnapshot(s.id, s.label)}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition text-xs font-semibold disabled:opacity-50"
                    >
                      🔄 Geri Yükle
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {syncProgress && (
          <div className="mb-6 space-y-2">
            <div className="flex justify-between text-xs text-gray-400 px-1">
              <span>İlerleme: {syncProgress.current} / {syncProgress.total}</span>
              <span>%{Math.round((syncProgress.current / syncProgress.total) * 100)}</span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {tournaments.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            Henüz turnuva eklenmedi. Yukarıdan bir URL girin.
          </p>
        ) : (
          <div className="space-y-2">
            {tournaments.filter(t => addMode === "manual" ? t.base_url === "manual" : t.base_url !== "manual").map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-white/3 rounded-xl px-4 py-3 hover:bg-white/5 transition group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{t.name}</span>
                    {t.raw_data && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" title="Ham veri kaydedilmiş — yeniden analiz edilebilir">
                        💾 Kaydedildi
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs font-mono mt-0.5">
                    {t.base_url}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {t.raw_data && (
                    <button
                      onClick={() => handleReprocess(t)}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/25 transition text-xs font-semibold disabled:opacity-50"
                    >
                      <span>⚡</span> {t.status === "processed" ? "Yeniden Analiz Et" : "Düzenle / Analiz Et"}
                    </button>
                  )}
                  <a
                    href={`/api/admin/export?tournamentId=${t.id}`}
                    download
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition text-xs font-semibold ${t.status !== "processed" ? "hidden" : ""}`}
                  >
                    <span>📊</span> Excel İndir
                  </a>
                  <button
                    onClick={() => handleSingleSync(t)}
                    disabled={loading || t.status === "processed"}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25 transition text-xs font-semibold disabled:opacity-50 ${t.status === "processed" ? "hidden" : ""}`}
                  >
                    <span>▶️</span> Yeniden Tara
                  </button>
                  <button
                    onClick={() => handleDeleteTournament(t)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition text-xs font-semibold disabled:opacity-50"
                    title="Turnuvayı Sil"
                  >
                    <span className="text-sm leading-none">🗑️</span>
                  </button>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      t.status === "processed"
                        ? "bg-green-500/15 text-green-400 border border-green-500/20"
                        : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                    }`}
                  >
                    {t.status === "processed" ? "✓ İşlendi" : "⏳ Bekliyor"}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {new Date(t.created_at).toLocaleDateString("tr-TR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </div>
      )}

      {activeMainTab === "unranked" && (
      <div className="glass rounded-2xl p-6 border-indigo-500/20">
        {/* Force Rank Unranked Speakers */}
        <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <span className="text-2xl">⚡</span> Manuel Sıralama Ekleme (Unranked)
        </h2>
        
        {unrankedSpeakers.length === 0 ? (
          <p className="text-gray-500 text-center py-6">
            Tüm konuşmacılar sıralamaya girmiş veya henüz yeterli veri yok.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
            {unrankedSpeakers.map((sp) => (
              <div key={sp.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white/5 rounded-xl px-4 py-3 hover:bg-white/10 transition">
                <div className="mb-2 sm:mb-0">
                  <div className="text-white font-medium">{sp.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <EloTag elo={sp.elo} />
                    <span className="text-xs text-gray-500">
                      {sp.total_tournaments} Turnuva
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleForceRank(sp.id)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition text-sm font-semibold disabled:opacity-50"
                  title="Bu kişiyi doğrudan Leaderboard'da listele"
                >
                  Leaderboard&apos;a Ekle
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {activeMainTab === "aliases" && (
      <div className="glass rounded-2xl p-6 border-orange-500/20">
        {/* Alias Management */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-2xl">👥</span> İsim Birleştirme (Alias Yönetimi)
          </h2>
          <button
             onClick={findPotentialAliases}
             disabled={aliasLoading}
             className="px-4 py-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition flex items-center gap-2 text-sm font-medium"
          >
             <span>🔍</span> Potansiyel Benzer İsimleri Bul
          </button>
        </div>
        
        <form onSubmit={handleAddAlias} className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            value={aliasSource}
            onChange={(e) => setAliasSource(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono text-sm"
            placeholder="Hatalı İsim (Örn: Ahmet Can Yılmaz)"
            required
          />
          <span className="flex items-center justify-center text-gray-500">{"->"}</span>
          <input
            type="text"
            value={aliasTarget}
            onChange={(e) => setAliasTarget(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono text-sm"
            placeholder="Doğru İsim (Örn: Ahmet Yılmaz)"
            required
          />
          <button
            type="submit"
            disabled={aliasLoading}
            className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 whitespace-nowrap"
          >
            {aliasLoading ? "Bekleyin..." : "Eşleştir"}
          </button>
        </form>

        {aliasClusters.length > 0 && (
          <div className="mb-6 bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
             <h3 className="text-orange-300 font-medium mb-3">🤔 Merge Dashboard (Aynı Olabilir)</h3>
             <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 mb-4">
                {aliasClusters.map((cluster) => {
                   const sel = mergeSelections[cluster.id];
                   if (!sel) return null;
                   
                   return (
                     <div key={cluster.id} className="bg-black/40 rounded-lg p-4 border border-white/10 shadow-inner">
                       <div className="text-xs text-orange-400 mb-3 uppercase tracking-wide font-bold">🎯 Hedef Olarak Seçilen (Ana İsim)</div>
                       <div className="flex flex-col gap-2">
                         {cluster.items.map((item, idx) => (
                           <div key={idx} className={`flex items-center gap-3 p-2 rounded transition-colors ${sel.main === item.name ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-white/5 border border-white/5 hover:bg-white/10'}`}>
                             <input 
                               type="radio" 
                               name={`main-${cluster.id}`}
                               checked={sel.main === item.name}
                               onChange={() => {
                                  const newSubs = cluster.items.filter((i) => i.name !== item.name).map((i) => i.name);
                                  setMergeSelections((prev) => ({
                                     ...prev,
                                     [cluster.id]: { main: item.name, subs: newSubs }
                                  }));
                               }}
                               className="w-4 h-4 text-orange-500 focus:ring-orange-500 bg-gray-700 border-gray-600"
                             />
                             <div className="flex-1 flex justify-between items-center">
                               <span className={sel.main === item.name ? "text-orange-400 font-bold" : "text-gray-300"}>
                                 {item.name}
                               </span>
                               <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-400 font-mono">
                                 {item.tournaments} Turnuva
                               </span>
                             </div>
                             {sel.main !== item.name && (
                               <label className="flex items-center gap-2 ml-4 cursor-pointer">
                                 <span className="text-xs text-gray-500">Birleştir:</span>
                                 <input 
                                   type="checkbox"
                                   checked={sel.subs.includes(item.name)}
                                   onChange={(e) => {
                                      const checked = e.target.checked;
                                      setMergeSelections((prev) => {
                                         const currentSubs = prev[cluster.id].subs;
                                         const newSubs = checked ? [...currentSubs, item.name] : currentSubs.filter((n) => n !== item.name);
                                         return { ...prev, [cluster.id]: { main: sel.main, subs: newSubs } };
                                      });
                                   }}
                                   className="w-5 h-5 text-indigo-500 focus:ring-indigo-500 bg-gray-700 border-gray-600 rounded"
                                 />
                               </label>
                             )}
                           </div>
                         ))}
                       </div>
                     </div>
                   );
                })}
             </div>
             <button
               onClick={handleBulkMergeAndRecalculate}
               disabled={isMerging}
               className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold shadow-lg shadow-orange-500/20 hover:from-orange-500 hover:to-red-500 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3 text-lg mt-2"
             >
               {isMerging ? (
                 <span className="animate-pulse flex items-center gap-2">⏳ Veriler yeniden analiz ediliyor, lütfen bekleyin...</span>
               ) : (
                 <><span>🧨</span> Seçili İsimleri Eşleştir ve Sistemi Yeniden Hesapla</>
               )}
             </button>
          </div>
        )}

        {aliases.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">Henüz eşleştirilmiş kopya isim yok.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {aliases.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3 text-sm border border-white/5">
                <div className="flex items-center gap-3">
                   <span className="text-red-300 line-through">{a.source_name}</span>
                   <span className="text-gray-500">{"->"}</span>
                   <span className="text-green-300 font-medium">{a.target_name}</span>
                </div>
                <button onClick={() => handleDeleteAlias(a.id)} className="text-red-400 hover:text-red-300 px-2 py-1 bg-red-500/10 hover:bg-red-500/20 rounded transition">Sil</button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
