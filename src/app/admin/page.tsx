"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Tournament } from "@/lib/supabase";

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
  const [aliasSuggestions, setAliasSuggestions] = useState<[string, string][]>([]);
  const [aliasLoading, setAliasLoading] = useState(false);

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

  function getLevenshteinDistance(a: string, b: string) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  async function findPotentialAliases() {
    setAliasLoading(true);
    setAliasSuggestions([]);
    try {
      const res = await fetch("/api/leaderboard");
      const { speakers } = await res.json();
      if (!speakers) return;
      
      const suggestions: [string, string][] = [];
      const names = speakers.map((s: any) => s.name);
      
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
           const dist = getLevenshteinDistance(names[i].toLowerCase(), names[j].toLowerCase());
           const isSub = names[i].toLowerCase().includes(names[j].toLowerCase()) || names[j].toLowerCase().includes(names[i].toLowerCase());
           if (dist <= 3 || isSub) {
              if (names[i].toLowerCase() !== names[j].toLowerCase()) {
                 suggestions.push([names[i], names[j]]);
              }
           }
        }
      }
      setAliasSuggestions(suggestions);
    } catch(e) { console.error(e); }
    finally { setAliasLoading(false); }
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

  async function handleResetDb() {
    if (!confirm("DİKKAT! Tüm veritabanı silinecek ve veriler en baştan (tarihe göre) yeniden analiz edilecektir. Bu işlem geri alınamaz. Emin misiniz?")) return;
    
    setLoading(true);
    setStatus("⚠️ Veritabanı sıfırlanıyor...");
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setStatus("✅ Veritabanı başarıyla sıfırlandı. Toplu analiz başlatılıyor...");
      await handleBulkSync(true);
    } catch (e: any) {
      setStatus("❌ İşlem hatası: " + e.message);
      setLoading(false);
    }
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
            <button
              onClick={() => handleProcess()}
              disabled={loading}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 active:scale-95"
            >
              {loading ? "İşleniyor..." : "✅ ELO'ları Hesapla & Kaydet"}
            </button>
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
              <span>🧨</span> Sıfırla & Baştan Analiz Et
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

        {aliasSuggestions.length > 0 && (
          <div className="mb-6 bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
             <h3 className="text-orange-300 text-sm font-medium mb-3">🤔 Bence Şunlar Aynı Kişi Olabilir:</h3>
             <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {aliasSuggestions.map((pair, idx) => (
                   <div key={idx} className="flex items-center justify-between text-sm bg-black/20 rounded-lg p-2 border border-white/5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-gray-300">{pair[0]}</span>
                        <span className="text-gray-500 text-xs">ile</span>
                        <span className="text-gray-300">{pair[1]}</span>
                      </div>
                      <div className="flex gap-2 ml-4">
                         <button onClick={() => { setAliasSource(pair[0]); setAliasTarget(pair[1]); }} className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded hover:bg-indigo-500/30">1.yi 2.ye Çevir</button>
                         <button onClick={() => { setAliasSource(pair[1]); setAliasTarget(pair[0]); }} className="text-xs bg-violet-500/20 text-violet-300 px-2 py-1 rounded hover:bg-violet-500/30">2.yi 1.ye Çevir</button>
                      </div>
                   </div>
                ))}
             </div>
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
