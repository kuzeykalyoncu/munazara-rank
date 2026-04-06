"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Tournament } from "@/lib/supabase";

export type AliasItem = { name: string; tournaments: number };
export type AliasCluster = { id: string; items: AliasItem[] };

function EloTag({ elo }: { elo: number }) {
  let color = "text-gray-400 border-gray-600";
  if (elo >= 1200) color = "text-violet-400 border-violet-500 bg-violet-500/10";
  else if (elo >= 1100) color = "text-indigo-400 border-indigo-500 bg-indigo-500/10";
  else if (elo >= 1050) color = "text-green-400 border-green-500 bg-green-500/10";

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

  const [aliasClusters, setAliasClusters] = useState<AliasCluster[]>([]);
  const [mergeSelections, setMergeSelections] = useState<Record<string, { main: string, subs: string[] }>>({});
  const [isMerging, setIsMerging] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authed) {
      loadTournaments();
      loadAliases();
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
           const subs = c.items.slice(1).map((i) => i.name);
           initial[c.id] = { main, subs };
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
      
      // Save tournament to DB
      const cleanUrl = targetUrl.endsWith("/") ? targetUrl : targetUrl + "/";
      const { data: tournament, error: insertError } = await supabase
        .from("tournaments")
        .upsert(
          { name: data.tournamentName, base_url: cleanUrl, status: "pending" },
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
    if (!scrapePreview || !currentTournamentId) {
      setStatus("❌ Önce turnuvayı tarayın.");
      return;
    }
    setLoading(true);
    setStatus("🔍 Önizleme hesaplanıyor...");
    try {
      const res = await fetch("/api/admin/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: currentTournamentId,
          speakers: scrapePreview.speakers,
          teams: scrapePreview.teams,
          results: scrapePreview.results,
          breakCount: breakCount || scrapePreview.inferredBreakCount,
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(`❌ Önizleme hatası: ${data.error}`); return; }
      // Initialize overrideBreaks with detected values
      const initial: Record<string, boolean> = {};
      for (const sp of data.speakers || []) {
        initial[sp.speakerId] = sp.didBreak;
      }
      setOverrideBreaks(initial);
      setProcessPreview(data.speakers || []);
      setStatus("✅ Önizleme hazır. Break tespitlerini kontrol edin ve onaylayın.");
    } catch { setStatus("❌ Önizleme sırasında hata oluştu."); }
    finally { setLoading(false); }
  }

  async function handleFinalize() {
    if (!scrapePreview || !currentTournamentId) return;
    setLoading(true);
    setStatus("⚙️ ELO hesaplanıyor ve kaydediliyor...");
    try {
      const res = await fetch("/api/admin/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: currentTournamentId,
          speakers: scrapePreview.speakers,
          teams: scrapePreview.teams,
          results: scrapePreview.results,
          breakCount: breakCount || scrapePreview.inferredBreakCount,
          dryRun: false,
          overrideBreaks,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(`❌ İşlem hatası: ${data.error}`); return; }
      setStatus(`🏆 İşlendi! ${data.processed} konuşmacı güncellendi.`);
      setScrapePreview(null);
      setProcessPreview(null);
      setOverrideBreaks({});
      setTournamentUrl("");
      setBreakCount("");
      setCurrentTournamentId(null);
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
    setLoading(true);
    setStatus(`🔄 Analiz ediliyor: ${t.name}`);
    
    const scraped = await handleScrape(undefined, t.base_url);
    if (scraped) {
      const processed = await handleProcess(scraped, scraped.tournamentId);
      if (processed) {
         setStatus(`✅ Başarıyla analiz edildi: ${t.name}`);
         loadTournaments();
      }
    } else {
      setLoading(false);
    }
  }

  async function handleResetDb() {
    if (!confirm("DİKKAT! Tüm hesaplamalar (Elo, H2H, Turnuva geçmişi) sıfırlanacaktır. Turnuva linkleri sabit kalır. Emin misiniz?")) return;
    
    setLoading(true);
    setStatus("⚠️ Hesaplamalar sıfırlanıyor...");
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setStatus("✅ Hesaplamalar başarıyla sıfırlandı. Aşağıdan turnuvaları KENDİ İSTEDİĞİNİZ TARİH SIRASIYLA yeniden analiz edebilirsiniz.");
      loadTournaments();
    } catch (e: any) {
      setStatus("❌ İşlem hatası: " + e.message);
    }
    setLoading(false);
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

      {/* Add Tournament */}
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
      </div>

      {/* Scrape Preview */}
      {scrapePreview && (
        <div className="glass rounded-2xl p-6 space-y-6 border-indigo-500/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                📋 Önizleme: {scrapePreview.tournamentName}
              </h2>
              <p className="text-gray-400 text-sm mt-0.5">
                Veritabanına kaydetmeden önce kontrol edin
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setScrapePreview(null); setProcessPreview(null); setOverrideBreaks({}); }}
                className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition text-sm"
              >
                ✕ İptal
              </button>
              {!processPreview ? (
                <button
                  onClick={handlePreview}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 active:scale-95 whitespace-nowrap"
                >
                  {loading ? "Hesaplanıyor..." : "🔍 Önizle & Break Kontrol Et"}
                </button>
              ) : (
                <button
                  onClick={handleFinalize}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 active:scale-95 whitespace-nowrap"
                >
                  {loading ? "Kaydediliyor..." : "✅ Onayla & Kaydet"}
                </button>
              )}
            </div>
          </div>

          {((scrapePreview.inferredBreakCount || 0) > 0) && !breakCount && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-4 py-3 rounded-lg text-sm">
              <strong className="flex items-center gap-1.5 mb-1">
                <span className="text-lg">🤖</span> Otomatik Tespit
              </strong>
              <p className="mt-1 text-indigo-200/80">
                Bu turnuvada <strong>{scrapePreview.inferredBreakCount}</strong> takımın break yaptığı algılandı ve ELO hesaplamasına dahil edilecektir. Eğer bu sayı yanlışsa, yukarıdaki <strong>Break Sayısı</strong> kutucuğuna manuel olarak doğru sayıyı girip doğrudan ELO&apos;ları Hesapla butonuna basabilirsiniz.
              </p>
            </div>
          )}

          {scrapePreview.warnings && scrapePreview.warnings.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 px-4 py-3 rounded-lg text-sm">
              <strong className="flex items-center gap-1.5 mb-1">
                <span className="text-lg">⚠️</span> Uyarılar (Erişilemeyen Turlar)
              </strong>
              <ul className="list-disc pl-5 space-y-0.5 mt-1.5 text-xs text-yellow-200/80">
                {scrapePreview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-3xl font-bold text-indigo-400">
                {scrapePreview.speakers.length}
              </div>
              <div className="text-gray-400 text-sm mt-1">Konuşmacı</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-3xl font-bold text-violet-400">
                {scrapePreview.teams.length}
              </div>
              <div className="text-gray-400 text-sm mt-1">Takım</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-3xl font-bold text-green-400">
                {scrapePreview.results.breaks.length}
              </div>
              <div className="text-gray-400 text-sm mt-1">Break Yapan</div>
            </div>
          </div>

          {/* Speakers preview */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Konuşmacılar (ilk 10)
            </h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {scrapePreview.speakers.slice(0, 10).map((sp, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/3 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="text-white">{sp.name}</span>
                  <span className="text-indigo-400 font-mono">
                    {sp.totalPoints.toFixed(1)} pts
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Teams preview */}
          {scrapePreview.teams.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Takımlar (ilk 8)
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {scrapePreview.teams.slice(0, 8).map((t, i) => (
                  <div
                    key={i}
                    className="bg-white/3 rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="text-gray-400 text-xs">{t.name}</div>
                    <div className="text-white">
                      {t.speakers.join(" & ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Process Preview Table — Break Toggle */}
          {processPreview && (
            <div className="bg-white/3 border border-indigo-500/20 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center gap-2">
                <span className="text-lg">📊</span>
                <span className="text-sm font-semibold text-indigo-300">Elo Önizleme — Break tespitlerini düzeltin</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Konuşmacı</th>
                      <th className="px-3 py-2 text-right">Avg Prelim SP</th>
                      <th className="px-3 py-2 text-right">Elo Değişimi</th>
                      <th className="px-3 py-2 text-right">Elo Sonrası</th>
                      <th className="px-3 py-2 text-center">Break ✓</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processPreview.map((sp: any) => (
                      <tr key={sp.speakerId} className="border-b border-white/5 hover:bg-white/3">
                        <td className="px-3 py-2 font-medium text-white">{sp.name}</td>
                        <td className="px-3 py-2 text-right text-gray-400">{sp.prelimSpeakAvg > 0 ? sp.prelimSpeakAvg.toFixed(1) : '—'}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${sp.eloChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {sp.eloChange >= 0 ? '+' : ''}{sp.eloChange}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-400 font-mono">{sp.eloAfter}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => setOverrideBreaks(prev => ({ ...prev, [sp.speakerId]: !prev[sp.speakerId] }))}
                            className={`w-8 h-5 rounded-full transition-colors relative ${
                              overrideBreaks[sp.speakerId] ? 'bg-green-500' : 'bg-white/10'
                            }`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                              overrideBreaks[sp.speakerId] ? 'left-3.5' : 'left-0.5'
                            }`} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleBulkSync(false)}
              disabled={loading || tournaments.length === 0}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
            >
              <span>🔄</span> Toplu Senkronizasyon
            </button>
            <button
              onClick={handleResetDb}
              disabled={loading || tournaments.length === 0}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-semibold"
            >
              <span>🧨</span> Sadece Hesaplamaları Sıfırla
            </button>
            <button
              onClick={handleDeleteAllData}
              disabled={loading || tournaments.length === 0}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-semibold"
            >
              <span>🗑️</span> Tüm Verileri Sil
            </button>
          </div>
        </div>

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
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-white/3 rounded-xl px-4 py-3 hover:bg-white/5 transition group"
              >
                <div>
                  <div className="text-white font-medium">{t.name}</div>
                  <div className="text-gray-500 text-xs font-mono mt-0.5">
                    {t.base_url}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={`/api/admin/export?tournamentId=${t.id}`}
                    download
                    className={`opacity-0 group-hover:opacity-100 items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition text-xs font-semibold hidden sm:flex ${t.status !== "processed" ? "pointer-events-none opacity-0" : ""}`}
                  >
                    <span>📊</span> Excel İndir
                  </a>
                  <button
                    onClick={() => handleSingleSync(t)}
                    disabled={loading || t.status === "processed"}
                    className="opacity-0 group-hover:opacity-100 items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition text-xs font-semibold disabled:opacity-0 hidden sm:flex"
                  >
                    <span>▶️</span> Analiz Et
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
                  <span className="text-gray-600 text-xs">
                    {new Date(t.created_at).toLocaleDateString("tr-TR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alias Management */}
      <div className="glass rounded-2xl p-6 border-orange-500/20">
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
    </div>
  );
}
