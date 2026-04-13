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
  match_count ≤ 20  →  K = 60   (Yerleştirme dönemi)
  match_count ≤ 100 →  K = 50   (Gelişim dönemi)
  match_count  > 100 →  K = 40   (Veteran)

Unranked Barajı:
  match_count ≤ 20 ise oyuncu sıralamada “Unranked” görünür.
  21. maçından itibaren gerçek sırasına yerleşir.`}
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
      <Section emoji="3️⃣" title="Gerçekleşen Skor (SA) ve Dağıtım Modu">
        <p className="text-gray-300 leading-relaxed mb-4">
          Takımın kazandığı veya kaybettiği toplam ELO, takım üyeleri arasında &quot;mutlak SP farkı&quot; eşiğine göre ikiye ayrılır.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
          <ModeCard
            color="purple"
            emoji="🟣"
            title="Gelişim Modü (Kazanım)"
            subtitle="|SP Farkı| ≤ 1 (Prelim)"
            description="İki partner birbirine eşit veya çok yakın SP almışsa düşük Elo&rsquo;luya büyük pay verilir. Gelişim şansı tanınır."
            formula={`A_Kazanım_Payı = Elo_B / (Elo_A + Elo_B)
// Düşük Elo’lu → büyük pay (ters oranlı)`}
          />
          <ModeCard
            color="blue"
            emoji="⚖️"
            title="Performans Modü (Kazanım)"
            subtitle="|SP Farkı| > 1 (Prelim)"
            description="SP farkı açıksa Gelişim ödülü iptal; daha yüksek SP alan aslan payını alır. Dağılım SP oranı ile belirlenir — Elo eşitliği artık sonucu değiştirmez."
            formula={`A_Kazanım_Payı = SP_A / (SP_A + SP_B)
// Yüksek SP'li → büyük pay (SP oranı)`}
          />
          <ModeCard
            color="red"
            emoji="🛡️"
            title="Kayıp Modu (SP Oranına Göre)"
            subtitle="Δ < 0 (Prelim)"
            description="Takım kaybederse daha yüksek SP alan oyuncu daha az Elo kaybeder. Dağılım ters SP oranıyla belirlenir. Outround'larda SP olmadığından Elo-bazlı kayıp uygulanır."
            formula={`A_Kayıp_Payı = SP_B / (SP_A + SP_B)
// SP_A > SP_B ise A daha az kaybeder (ters SP oranı)`}
          />
          <ModeCard
            color="purple"
            emoji="🦸‍♂️"
            title="IRON (Tek Kişi) Dağıtımı"
            subtitle="Gelmeyen Yarışmacı"
            description="Bir yarışmacının maça gelmeyip 0 SP aldığı, partnerinin ise IRON olarak (iki konuşma yaparak) tek başına yarıştığı turlar için özel moddur."
            formula={`Eğer S1 = 0 SP ise:
  S1_Payı = 0 % (Ne kazanır ne kaybeder)
  S2_Payı = 100 % (Takımın tüm kaderi onda biter)`}
          />
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-amber-300 text-sm mt-2">
          💡 <strong>Outround (Eleme) Maçlarında Ne Olur?</strong> Final, yarı final gibi konuşmacı puanlaması (SP) yapılmayan turlarda standart <strong className="text-white">Kazanım / Kayıp Modu</strong> çalışır.
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
          Tüm prelim <strong className="text-white">ve outround (eleme)</strong> turlarındaki delta&apos;lar
          kümülatif olarak toplanır. Eleme turları, SP yoksa{" "}
          <strong className="text-indigo-300">Gelişim / Kayıp modunda</strong> hesaplanır.
        </p>
      </Section>

      {/* Outround Pairwise */}
      <Section emoji="⚔️" title="Outround (Eleme) Turu — Pairwise Maç Mantığı">
        <p className="text-gray-300 leading-relaxed mb-4">
          Eleme turlarında tam bir 1–2–3–4 puanlı sıralama olmayabilir; bunun yerine &quot;tur atlandı / elendi&quot;
          bilgisi vardır. Sistem bu duruma göre otomatik olarak doğru pairwise skorunu üretir.
        </p>
        <div className="space-y-4">
          <div className="bg-white/3 rounded-xl border border-white/[0.08] p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🥊</span>
              <span className="font-semibold text-white text-sm">Çeyrek / Yarı Final Modu</span>
              <span className="text-xs text-gray-500 ml-auto">4 takım, 2 çıkar</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 uppercase border-b border-white/10">
                    <th className="px-3 py-1.5 text-left">Karşılaşma</th>
                    <th className="px-3 py-1.5 text-center">SA</th>
                    <th className="px-3 py-1.5 text-center">SB</th>
                    <th className="px-3 py-1.5 text-left">Açıklama</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="px-3 py-2 text-green-300">Çıkan 1 ↔ Çıkan 2</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-300">0.5</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-300">0.5</td>
                    <td className="px-3 py-2 text-gray-500">İkisi de geçti → berabere</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="px-3 py-2 text-red-300">Elenen 3 ↔ Elenen 4</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-300">0.5</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-300">0.5</td>
                    <td className="px-3 py-2 text-gray-500">İkisi de elendi → berabere</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">
                      <span className="text-green-300">Çıkan</span>{" ↔ "}
                      <span className="text-red-300">Elenen</span>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-green-400 font-bold">1</td>
                    <td className="px-3 py-2 text-center font-mono text-red-400 font-bold">0</td>
                    <td className="px-3 py-2 text-gray-500">Çıkan kazandı sayılır</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white/3 rounded-xl border border-white/[0.08] p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏆</span>
              <span className="font-semibold text-white text-sm">Final Modu</span>
              <span className="text-xs text-gray-500 ml-auto">4 takım, tam sıralama</span>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Admin panelinde takımlar 1.–2.–3.–4. şeklinde sıralanmışsa{" "}
              <strong className="text-white">klasik pairwise</strong> çalışır:{" "}
              1. &gt; 2. &gt; 3. &gt; 4. (her üst sıra alttaki tüm sıraları yener).
              Sadece şampiyon biliniyorsa, şampiyon diğer 3&apos;ünü yener (SA=1), kalan 3 birbiriyle berabere (SA=0.5).
            </p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-blue-300 text-sm">
            🔍 <strong>SP Fallback:</strong> Eleme turunda SP yoksa sistem{" "}
            <code className="bg-black/30 px-1 rounded mx-1">spDiff = 0</code>
            kabul eder ve otomatik olarak <strong>Gelişim / Kayıp modu</strong> devreye girer.
            Admin panelinden SP&apos;leri manuel girdiysen ve fark &gt; 1 ise{" "}
            <strong>Performans modu</strong> tetiklenir.
          </div>
        </div>
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
              <ExampleRow tur="🏆 Çeyrek Final" k={48} teamElo={1013} rakipElo={1080} ea={0.40} mod="Outround-Gelişim" sa={0.63} delta={+11} />
              <tr className="bg-white/3 border-t border-white/20">
                <td colSpan={7} className="px-3 py-2.5 text-right font-semibold text-gray-300">
                  Toplam (Prelim + Outround)
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-green-400">+24</td>
              </tr>
              <tr className="bg-green-500/5 border-t border-green-500/20">
                <td colSpan={7} className="px-3 py-2.5 text-right text-gray-400 text-xs italic">
                  Break Bonusu (1. break → +5)
                </td>
                <td className="px-3 py-2.5 text-right text-green-400 font-bold">+5</td>
              </tr>
              <tr className="bg-indigo-500/10 border-t border-indigo-500/40">
                <td colSpan={7} className="px-3 py-2.5 text-right font-bold text-white">
                  Yeni Elo (1000 + 24 + 5)
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-indigo-400 text-sm">1029</td>
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
            q="Eleme (outround) turları Elo hesabına giriyor mu?"
            a="Evet, artık giriyor. SP verisi yoksa sistem SP farkı = 0 kabul ederek Gelişim/Kayıp modunu çalıştırır. Admin panelinden SP'leri manuel girebilirsin; girersen fark > 1 olursa Performans modu devreye girebilir. Pairwise mantığı çeyrek/yarı final (2 çıkan, 2 elenen) ve final (tam sıralama) formatlarına göre otomatik seçilir."
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
            a="SP yoksa (prelim ya da outround fark etmez) sistem SP farkını 0 kabul eder → Gelişim/Kayıp modu devreye girer: kazanırsa düşük Elo'luya daha fazla ödül, kaybederse yüksek Elo'ludan daha fazla düşülür."
          />
          <FaqItem
            q="Outround'da log'da ne görünür?"
            a='Round log kayıtlarında eleme turları için "outround-gelisim", "outround-kayip" veya "outround-berabere" etiketleri kullanılır. Bu sayede prelim turlarıyla eleme turları log içinde kolayca ayırt edilebilir.'
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
  color: "purple" | "blue" | "red";
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
  formula: string;
}) {
  const borderClass =
    color === "purple"
      ? "border-purple-500/30 bg-purple-500/5"
      : color === "red"
      ? "border-red-500/30 bg-red-500/5"
      : "border-blue-500/30 bg-blue-500/5";
  const titleClass = color === "purple" ? "text-purple-300" : color === "red" ? "text-red-300" : "text-blue-300";
  const badgeClass =
    color === "purple"
      ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
      : color === "red"
      ? "bg-red-500/20 text-red-400 border-red-500/30"
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
              : mod.startsWith("Outround")
              ? "text-amber-400 bg-amber-500/15"
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
