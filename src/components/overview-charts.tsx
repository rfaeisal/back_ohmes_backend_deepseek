"use client";

// =============================================================================
// OverviewCharts — grafik interaktif untuk Admin Overview
// Dibangun plain HTML/CSS sesuai pola dataviz (tanpa library chart)
// =============================================================================

interface YieldDay { date: string; yieldPct: number | null; boxes: number; }
interface WasteCat { category: string; kg: number; }

export default function OverviewCharts({ yieldData, wasteData }: {
  yieldData: YieldDay[];
  wasteData: WasteCat[];
}) {
  const maxWaste = Math.max(...wasteData.map((w) => w.kg), 0.1);

  return (
    <div className="viz-root grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <style jsx>{`
        .viz-root {
          color-scheme: light;
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --series-1: #2a78d6;
          --series-2: #eb6834;
          --series-3: #1baf7a;
          --series-4: #eda100;
          --seq-blue: #3987e5;
          --grid-line: #e5e2da;
          --band: #e8f3e8;
          --band-line: #0ca30c;
        }
        .chart-card {
          background: var(--surface-1);
          border: 1px solid var(--grid-line);
          border-radius: 12px;
          padding: 20px;
        }
        .chart-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
        .chart-sub { font-size: 12px; color: var(--text-secondary); margin-bottom: 14px; }

        /* Yield bars */
        .yield-chart { display: flex; align-items: flex-end; gap: 2px; height: 160px; position: relative; }
        .yield-band {
          position: absolute; left: 0; right: 0; height: 38px;
          bottom: 52%; background: var(--band);
          border-top: 1px dashed var(--band-line);
          border-bottom: 1px dashed var(--band-line);
          z-index: 0;
        }
        .yield-band-label {
          position: absolute; right: 4px; top: 2px;
          font-size: 10px; color: var(--band-line); z-index: 1;
        }
        .yield-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; position: relative; z-index: 1; }
        .yield-bar {
          width: 70%; max-width: 44px; border-radius: 4px 4px 0 0;
          background: var(--seq-blue);
          transition: filter 0.15s;
          position: relative;
        }
        .yield-bar:hover { filter: brightness(1.15); }
        .yield-value { font-size: 11px; color: var(--text-secondary); }
        .yield-day { font-size: 10px; color: var(--text-secondary); }
        .yield-empty { color: #b5b2a8; }

        /* Waste bars */
        .waste-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .waste-label { width: 92px; font-size: 12px; color: var(--text-primary); text-align: right; flex-shrink: 0; }
        .waste-track { flex: 1; height: 22px; background: #f0eee9; border-radius: 4px; position: relative; }
        .waste-bar { height: 100%; border-radius: 4px; transition: filter 0.15s; }
        .waste-bar:hover { filter: brightness(1.1); }
        .waste-value { width: 76px; font-size: 12px; color: var(--text-secondary); flex-shrink: 0; }

        .empty-note { font-size: 12px; color: var(--text-secondary); padding: 24px 0; text-align: center; }
      `}</style>

      {/* Chart 1: Yield harian 7 hari */}
      <div className="chart-card">
        <p className="chart-title">Yield Harian — 7 Hari Terakhir</p>
        <p className="chart-sub">Yield rata-rata produksi per hari · area hijau = target 110–114%</p>
        {yieldData.every((d) => d.yieldPct === null) ? (
          <div className="empty-note">Belum ada data produksi 7 hari terakhir.</div>
        ) : (
          <div className="yield-chart">
            <div className="yield-band">
              <span className="yield-band-label">110–114%</span>
            </div>
            {yieldData.map((d) => (
              <div key={d.date} className="yield-col" title={`${d.date}: ${d.yieldPct != null ? d.yieldPct.toFixed(2) + "%" : "belum ada data"} (${d.boxes} boks)`}>
                <span className={`yield-value ${d.yieldPct == null ? "yield-empty" : ""}`}>
                  {d.yieldPct != null ? d.yieldPct.toFixed(1) : "–"}
                </span>
                <div
                  className="yield-bar"
                  style={{ height: d.yieldPct != null ? `${Math.min(100, Math.max(4, ((d.yieldPct - 100) / 20) * 100))}%` : "2px" }}
                />
                <span className="yield-day">{d.date.slice(5).replace("-", "/")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chart 2: Waste per kategori */}
      <div className="chart-card">
        <p className="chart-title">Waste 7 Hari Terakhir</p>
        <p className="chart-sub">Total kg per kategori limbah produksi</p>
        {wasteData.every((w) => w.kg === 0) ? (
          <div className="empty-note">Belum ada waste tercatat 7 hari terakhir.</div>
        ) : (
          <div>
            {wasteData.map((w, i) => (
              <div key={w.category} className="waste-row">
                <span className="waste-label">{w.category.replace("_", " ")}</span>
                <div className="waste-track">
                  <div
                    className="waste-bar"
                    style={{
                      width: `${Math.max(2, (w.kg / maxWaste) * 100)}%`,
                      background: `var(--series-${i + 1})`,
                    }}
                  />
                </div>
                <span className="waste-value">{w.kg.toFixed(1)} kg</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
