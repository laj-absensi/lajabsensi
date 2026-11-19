"use client";

export type WeeklyStatPoint = {
  label: string;
  hadir: number;
  terlambat: number;
};

export type MonthlyStatPoint = {
  label: string;
  totalHadir: number;
};

export type LateStatPoint = {
  label: string;
  jumlahTerlambat: number;
};

type AttendanceChartsProps = {
  weeklyData: WeeklyStatPoint[];
  monthlyData: MonthlyStatPoint[];
  lateData: LateStatPoint[];
};

export function AttendanceCharts({
  weeklyData,
  monthlyData,
  lateData,
}: AttendanceChartsProps) {
  const maxWeekly = Math.max(
    1,
    ...weeklyData.map((d) => d.hadir + d.terlambat)
  );
  const maxMonthly = Math.max(1, ...monthlyData.map((d) => d.totalHadir));
  const maxLate = Math.max(1, ...lateData.map((d) => d.jumlahTerlambat));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Grafik Kehadiran Mingguan */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Kehadiran Mingguan (7 Hari)
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Data aktual check-in & keterlambatan
            </p>
          </div>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            Mingguan
          </span>
        </div>

        <div className="mt-4 flex h-40 items-end justify-between gap-2 pt-2">
          {weeklyData.map((item) => {
            const total = item.hadir + item.terlambat;
            const heightPct = Math.round((total / maxWeekly) * 100);
            return (
              <div
                key={item.label}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className="font-mono text-[10px] font-semibold text-slate-700">
                  {total}
                </span>
                <div className="flex h-28 w-full items-end justify-center rounded-t-md bg-slate-100 px-0.5">
                  <div
                    style={{ height: `${Math.max(heightPct, total > 0 ? 12 : 0)}%` }}
                    title={`${item.label}: Hadir ${item.hadir}, Terlambat ${item.terlambat}`}
                    className="w-full rounded-t-md bg-blue-600 transition-all"
                  />
                </div>
                <span className="text-[10px] font-medium text-slate-500">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grafik Kehadiran Bulanan */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Kehadiran Bulanan (6 Bulan)
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Akumulasi kehadiran per bulan
            </p>
          </div>
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            Bulanan
          </span>
        </div>

        <div className="mt-4 flex h-40 items-end justify-between gap-2 pt-2">
          {monthlyData.map((item) => {
            const heightPct = Math.round((item.totalHadir / maxMonthly) * 100);
            return (
              <div
                key={item.label}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className="font-mono text-[10px] font-semibold text-slate-700">
                  {item.totalHadir}
                </span>
                <div className="flex h-28 w-full items-end justify-center rounded-t-md bg-slate-100 px-0.5">
                  <div
                    style={{
                      height: `${Math.max(heightPct, item.totalHadir > 0 ? 12 : 0)}%`,
                    }}
                    title={`${item.label}: ${item.totalHadir} kehadiran`}
                    className="w-full rounded-t-md bg-emerald-600 transition-all"
                  />
                </div>
                <span className="text-[10px] font-medium text-slate-500">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grafik Statistik Keterlambatan */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Statistik Keterlambatan
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Jumlah status terlambat 7 hari terakhir
            </p>
          </div>
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            Terlambat
          </span>
        </div>

        <div className="mt-4 flex h-40 items-end justify-between gap-2 pt-2">
          {lateData.map((item) => {
            const heightPct = Math.round((item.jumlahTerlambat / maxLate) * 100);
            return (
              <div
                key={item.label}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className="font-mono text-[10px] font-semibold text-slate-700">
                  {item.jumlahTerlambat}
                </span>
                <div className="flex h-28 w-full items-end justify-center rounded-t-md bg-slate-100 px-0.5">
                  <div
                    style={{
                      height: `${Math.max(heightPct, item.jumlahTerlambat > 0 ? 12 : 0)}%`,
                    }}
                    title={`${item.label}: ${item.jumlahTerlambat} terlambat`}
                    className="w-full rounded-t-md bg-amber-500 transition-all"
                  />
                </div>
                <span className="text-[10px] font-medium text-slate-500">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}