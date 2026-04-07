import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hesaplama Şekli | MünazaraRank",
  description:
    "MünazaraRank'in Elo puanlama sisteminin matematiksel açıklaması. Dinamik K-faktörü, SP farkı bazlı dağıtım, break bonusu ve beklenen skor hesaplama yöntemlerini keşfedin.",
};

export default function MechanicsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 py-8">
      {/* Hero */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium">
          📐 Hesaplama Sistemi
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gradient leading-tight">
          ELO Nasıl Hesaplanır?
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          MünazaraRank&apos;in her adımını şeffaf bir şekilde açıklayan tam teknik döküman.
          Matematiği kendiniz doğrulayabilirsiniz.
        </p>
      </div>

      {/* Overview box */}
      <div className="glass rounded-2xl p-6 border-indigo-500/20 glow-indigo">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">🧭</span> Genel Bakış
        </h2>
        <p className="text-gray-300 leading-relaxed">
          Sistemimiz, geleneksel Elo&apos;yu turnuva münazerası için özelleştirmiş bir varyantı kullanır.
          Temel farklılıklar şunlardır:{" "}
          <strong className="text-indigo-300">tur bazlı hesaplama</strong>{" "}
          (turnuva sonu değil, her tur ayrı ayrı),{" "}
          <strong className="text-indigo-300">konuşmacı puanına (SP) dayalı performans ödülü</strong>, ve{" "}
          <strong className="text-indigo-300">dinamik K-faktörü</strong> (deneyim arttıkça daha istikrarlı Elo).
        </p>
      </div>

      {/* Step 1 */}
      <Section emoji="1️⃣" title="Dinamik K-Faktörü">
        <p className="text-gray-300 leading-relaxed mb-4">
          K-faktörü, bir oyuncunun Elo&apos;sunun ne kadar <em>hızlı</em> değişeceğini belirler.
          Yeni oyuncular için büyük, deneyimliler için küçüktür.
          Biz &quot;maç sayısı&quot; yerine{" "}
          <strong className="text-white">girilen salon (oda) sayısını</strong> kullanırız;
          çünkü 6 rakibe karşı aynı anda oynanan British Parliamentary formatında H2H sayacı
          pairwise kayıtlar nedeniyle şişirilebilir.
        </p>
        <CodeBlock>
          {`match_count = girilen salon sayısı (her tur +1)

K-Faktörü:
  match_count ≤  5  →  K = 64   (yeni başlayan)
  match_count ≤ 15  →  K = 48
  match_count ≤ 30  →  K = 32
  match_count  > 30 →  K = 24   (deneyimli)`}
        </CodeBlock>
      </Section>

      {/* Step 2 */}
      <Section emoji="2️⃣" title="Takım Elosu ve Beklenen Skor (EA)">
        <p className="text-gray-300 leading-relaxed mb-4">
          Her tur başlamadan önce, her oyuncunun <strong className="text-white">takım Elosu</strong> hesaplanır:
          oyuncunun kendi Elo&apos;su ile takım arkadaşının Elo&apos;sunun ortalaması.
          Bu değer, beklenen skoru (EA) üretmek için rakiplerin Elosu ile karşılaştırılır.
        </p>
        <CodeBlock>
          {`TeamElo  = (oyuncuElo + ortakElo) / 2

// EA için rakip TeamElo = aynı salondaki diğer 3 takımın ortalama TeamElosu
// (team1 + team2 + team3) / 3  (kendi takımı hariç)

EA = 1 / (1 + 10^((rakipTeamElo - TeamElo) / 400))`}
        </CodeBlock>
        <p className="text-gray-400 text-sm mt-3">
          EA 0 ile 1 arasındadır. 0.5 → iki taraf eşit güçte; 0.8 → oyuncu ezici favori demektir.
        </p>
      </Section>

      {/* Step 3 */}
      <Section emoji="3️⃣" title="Gerçekleşen Skor (SA) ve İki Dağıtım Modu">
        <p className="text-gray-300 leading-relaxed mb-4">
          SA, oyuncunun o turda &quot;gerçekte ne kadar iyi performans gösterdiğini&quot; ifade eden 0–1 değeridir.
          <br />
          Hesaplama yöntemi, oyuncunun SP&apos;si ile takım arkadaşının SP&apos;si arasındaki farka göre iki moddan birine girer:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
          <ModeCard
            color="purple"
            emoji="🟣"
            title="Gelişim Modu"
            subtitle="SP Fark ≤ 1"
            description="İki partner birbirine çok yakın SP almışsa (veya eşit ise) Gelişim Modu devreye girer. SA, takımın o salondaki sıralamasına göre (1., 2., 3. veya 4.) belirlenir."
            formula={`SA (sıralamaya göre):
  1. Sıra → 1.00
  2. Sıra → 0.60
  3. Sıra → 0.40
  4. Sıra → 0.00`}
          />
          <ModeCard
            color="blue"
            emoji="🔵"
            title="Performans Modu"
            subtitle="SP Fark > 1"
            description="Partner SP'ler arasında 2 veya daha fazla puan fark varsa Performans Modu devreye girer. SA, oyuncunun kendi SP'sinin o salondaki tüm SP'ler içindeki göreli konumuna (percentile) göre belirlenir."
            formula={`SA (relatif SP'ye göre):
  SA = (oyuncuSP - minSP) / (maxSP - minSP)
  minSP / maxSP = o salondaki en düşük/yüksek SP`}
          />
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-amber-300 text-sm mt-2">
          💡 <strong>Neden iki mod?</strong> BP münazeralarında bazen tüm konuşmacılar eşit SP alır
          (tüm 8 konuşmacı 75 puan gibi). Bu durumda relatif performans hesabı anlamsız olur.
          Gelişim Modu, bu durumlarda sıralama bilgisini kullanır.
        </div>
      </Section>

      {/* Step 4 */}
      <Section emoji="4️⃣" title="Elo Delta (Ham Değişim)">
        <p className="text-gray-300 leading-relaxed mb-4">
          Her tur için Elo değişimi klasik formülle hesaplanır:
        </p>
        <CodeBlock>
          {`EloDelta = K × (SA - EA)

Örnek:
  K = 32, EA = 0.45 (hafif underdog), SA = 1.0 (1. sıra)
  EloDelta = 32 × (1.0 - 0.45) = +17.6  ≈ +18

  K = 32, EA = 0.70 (favori), SA = 0.0 (4. sıra)
  EloDelta = 32 × (0.0 - 0.70) = -22.4  ≈ -22`}
        </CodeBlock>
        <p className="text-gray-400 text-sm mt-3">
          Tüm prelim (ön eleme) turlarındaki delta&apos;lar toplanır.
          Outround (eleme) turları Elo hesaplamasına <strong className="text-white">dahil edilmez</strong>:
          eleme turlarında SP bilgisi toplanmadığından adil bir karşılaştırma yapılamaz.
        </p>
      </Section>

      {/* Step 5 */}
      <Section emoji="5️⃣" title="Kümülatif Break Bonusu">
        <p className="text-gray-300 leading-relaxed mb-4">
          Break (eleme turu oynama hakkı kazanma), kariyerde kalıcı bir bonus oluşturur.
          Her break <strong className="text-white">+5 Elo</strong> değerindedir ve bir defaya mahsus değil,
          kariyerdeki tüm break&apos;ler kümülatif olarak eklenir.
        </p>
        <CodeBlock>
          {`BreakBonus = career_break_count × 5

// Örnek: 3 farklı turnuvada break eden bir oyuncu
BreakBonus = 3 × 5 = +15 Elo

// Hesaplama sonu:
EloSonu = EloBaşlangıcı + toplam_prelim_delta + BreakBonus`}
        </CodeBlock>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-300 text-sm mt-3">
          ✅ Break bonusu idempotent&apos;tir: yani veriler sıfırlanıp yeniden hesaplansa bile
          aynı sonuç üretilir çünkü<code className="bg-black/30 px-1 rounded mx-0.5">career_break_count</code>
          her turnuva için ayrı ayrı takip edilir.
        </div>
      </Section>

      {/* Step 6 */}
      <Section emoji="6️⃣" title="Tam Hesaplama Akışı — Örnek Senaryo">
        <p className="text-gray-300 leading-relaxed mb-4">
          Aşağıdaki örnek, bir oyuncunun 4 prelim turunu ve 1 break&apos;i kapsayan
          tam hesaplama adımlarını gösterir:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-white/10 rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-white/5 text-gray-400 uppercase tracking-wider">
                <th className="px-3 py-2.5 text-left">Tur</th>
                <th className="px-3 py-2.5 text-right">K</th>
                <th className="px-3 py-2.5 text-right">TeamElo</th>
                <th className="px-3 py-2.5 text-right">RakipElo</th>
                <th className="px-3 py-2.5 text-right">EA</th>
                <th className="px-3 py-2.5 text-center">Mod</th>
                <th className="px-3 py-2.5 text-right">SA</th>
                <th className="px-3 py-2.5 text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              <ExampleRow tur="Tur 1" k={64} teamElo={1000} rakipElo={1050} ea={0.43} mod="Gelişim" sa={0.60} delta={+11} />
              <ExampleRow tur="Tur 2" k={48} teamElo={1011} rakipElo={990} ea={0.53} mod="Performans" sa={0.85} delta={+15} />
              <ExampleRow tur="Tur 3" k={48} teamElo={1026} rakipElo={1100} ea={0.37} mod="Gelişim" sa={0.40} delta={+1} />
              <ExampleRow tur="Tur 4" k={48} teamElo={1027} rakipElo={1020} ea={0.50} mod="Performans" sa={0.20} delta={-14} />
              <tr className="bg-white/3 border-t border-white/20">
                <td colSpan={7} className="px-3 py-2.5 text-right font-semibold text-gray-300">
                  Prelim Toplamı
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-green-400">+13</td>
              </tr>
              <tr className="bg-green-500/5 border-t border-green-500/20">
                <td colSpan={7} className="px-3 py-2.5 text-right text-gray-400 text-xs italic">
                  Break Bonusu (1. break → +5)
                </td>
                <td className="px-3 py-2.5 text-right text-green-400 font-bold">+5</td>
              </tr>
              <tr className="bg-indigo-500/10 border-t border-indigo-500/40">
                <td colSpan={7} className="px-3 py-2.5 text-right font-bold text-white">
                  Yeni Elo (1000 + 13 + 5)
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-indigo-400 text-sm">1018</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Step 7 */}
      <Section emoji="7️⃣" title="Sıralama Tiers">
        <p className="text-gray-300 leading-relaxed mb-4">
          Oyuncular Elo değerlerine göre altı sınıfa ayrılır:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { color: "text-violet-400 border-violet-500 bg-violet-500/10", label: "Şampiyon", range: "≥ 1200" },
            { color: "text-amber-400 border-amber-500 bg-amber-500/10", label: "Uzman", range: "≥ 1100" },
            { color: "text-blue-400 border-blue-500 bg-blue-500/10", label: "Avantajlı", range: "≥ 1050" },
            { color: "text-green-400 border-green-600 bg-green-500/10", label: "Yükselen", range: "≥ 1000" },
            { color: "text-gray-300 border-gray-600", label: "Standart", range: "≥ 950" },
            { color: "text-rose-400 border-rose-700 bg-rose-500/10", label: "Başlangıç", range: "< 950" },
          ].map((tier) => (
            <div
              key={tier.label}
              className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border text-center ${tier.color}`}
            >
              <span className="font-bold text-sm">{tier.label}</span>
              <span className="text-xs opacity-70 font-mono">{tier.range} Elo</span>
            </div>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section emoji="❓" title="Sık Sorulan Sorular">
        <div className="space-y-4">
          <FaqItem
            q="Eleme (outround) turları neden sayılmıyor?"
            a="Eleme turlarında Tabbycat genellikle konuşmacı puanı toplamaz. SP olmadan Performans/Gelişim modundan hangisinin devreye gireceği bilinemez ve skor hesaplanamaz."
          />
          <FaqItem
            q="H2H (Head-to-Head) nasıl işliyor?"
            a="BP formatında bir salonda 4 takım vardır. Oyuncunun 3 rakiple aynı anda maç yaptığı kabul edilir ve H2H kayıtları pairwise (ikili) olarak tutulur. Yani 1 turda oyuncu 3 ayrı H2H maçı oynamış sayılır."
          />
          <FaqItem
            q="Aynı adda iki konuşmacı olursa ne olur?"
            a='Admin panelindeki "Alias Yönetimi" bölümünden iki ismi birleştirebilirsiniz. Birleştirme sonrası sistem tüm verileri yeniden hesaplar.'
          />
          <FaqItem
            q="SP sıfır olan turlar nasıl işlenir?"
            a="Eğer bir oyuncunun SP'si 0 olarak görünüyorsa (veri eksik), o tur için SA = 0 kabul edilmez; bunun yerine yalnızca sıralama bazlı Gelişim Modu uygulanır."
          />
        </div>
      </Section>
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────────────

function Section({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
        <span className="text-2xl">{emoji}</span> {title}
      </h2>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-sm text-indigo-200 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function ModeCard({
  color,
  emoji,
  title,
  subtitle,
  description,
  formula,
}: {
  color: "purple" | "blue";
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
  formula: string;
}) {
  const borderClass =
    color === "purple"
      ? "border-purple-500/30 bg-purple-500/5"
      : "border-blue-500/30 bg-blue-500/5";
  const titleClass = color === "purple" ? "text-purple-300" : "text-blue-300";
  const badgeClass =
    color === "purple"
      ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
      : "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return (
    <div className={`rounded-xl p-4 border ${borderClass} space-y-3`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{emoji}</span>
        <div>
          <div className={`font-bold text-sm ${titleClass}`}>{title}</div>
          <div className={`text-xs px-2 py-0.5 rounded border inline-block mt-0.5 ${badgeClass}`}>
            {subtitle}
          </div>
        </div>
      </div>
      <p className="text-gray-400 text-xs leading-relaxed">{description}</p>
      <pre className="bg-black/30 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 whitespace-pre-wrap">
        {formula}
      </pre>
    </div>
  );
}

function ExampleRow({
  tur,
  k,
  teamElo,
  rakipElo,
  ea,
  mod,
  sa,
  delta,
}: {
  tur: string;
  k: number;
  teamElo: number;
  rakipElo: number;
  ea: number;
  mod: string;
  sa: number;
  delta: number;
}) {
  return (
    <tr className="border-b border-white/5 hover:bg-white/3">
      <td className="px-3 py-2 text-white font-medium">{tur}</td>
      <td className="px-3 py-2 text-right font-mono text-gray-300">{k}</td>
      <td className="px-3 py-2 text-right font-mono text-gray-400">{teamElo}</td>
      <td className="px-3 py-2 text-right font-mono text-gray-400">{rakipElo}</td>
      <td className="px-3 py-2 text-right font-mono text-gray-400">{ea.toFixed(2)}</td>
      <td className="px-3 py-2 text-center">
        <span
          className={`text-xs px-2 py-0.5 rounded font-medium ${
            mod === "Performans"
              ? "text-blue-400 bg-blue-500/15"
              : "text-purple-400 bg-purple-500/15"
          }`}
        >
          {mod}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono text-gray-400">{sa.toFixed(2)}</td>
      <td className={`px-3 py-2 text-right font-mono font-bold ${delta >= 0 ? "text-green-400" : "text-red-400"}`}>
        {delta >= 0 ? "+" : ""}{delta}
      </td>
    </tr>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="bg-white/3 rounded-xl px-4 py-4 border border-white/5">
      <div className="text-white font-semibold mb-1.5 flex items-start gap-2">
        <span className="text-indigo-400 mt-0.5">Q.</span>
        {q}
      </div>
      <div className="text-gray-400 text-sm leading-relaxed">
        <span className="text-gray-500 font-medium">A.</span> {a}
      </div>
    </div>
  );
}
