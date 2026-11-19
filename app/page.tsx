
export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-blue-800">
            LAJAbsensi
          </h1>
          <p className="mt-2 text-slate-500">
            Sistem Informasi Absensi Karyawan
          </p>
        </div>

        <div className="rounded-xl bg-blue-50 p-5 text-center">
          <h2 className="text-xl font-semibold text-blue-900">
            Selamat Datang
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Aplikasi absensi PT. Lamin Abadi Jaya
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          LAJAbsensi © 2026
        </p>
      </div>
    </main>
  );
}
