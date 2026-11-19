"use client";

import { useEffect, useRef, useState } from "react";

type KaryawanOption = {
  id: number;
  NIK: string | null;
  Nama_lengkap: string | null;
  Jabatan: string | null;
};

type AbsensiFormProps = {
  isAdmin: boolean;
  daftarKaryawan: KaryawanOption[];
  checkInAction: (formData: FormData) => void | Promise<void>;
  checkOutAction: (formData: FormData) => void | Promise<void>;
};

export function AbsensiForm({
  isAdmin,
  daftarKaryawan,
  checkInAction,
  checkOutAction,
}: AbsensiFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const latInputRef = useRef<HTMLInputElement>(null);
  const lngInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [pendingAction, setPendingAction] = useState<
    "checkin" | "checkout" | null
  >(null);
  const [cameraOpen, setCameraOpen] = useState<boolean>(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("");
  const [cameraError, setCameraError] = useState<string>("");

  const [lokasiStatus, setLokasiStatus] = useState<string>(
    "GPS otomatis aktif saat Check-in / Check-out."
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function openCameraFor(mode: "checkin" | "checkout") {
    setCameraError("");
    setPhotoDataUrl("");
    if (photoInputRef.current) photoInputRef.current.value = "";
    setPendingAction(mode);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        "Kamera tidak didukung di browser ini. Anda tetap bisa melanjutkan tanpa foto."
      );
      setCameraOpen(true);
      return;
    }

    try {
      stopCamera();
      setPendingAction(mode);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal mengakses kamera.";
      setCameraError(
        `Akses kamera gagal (${msg}). Anda tetap bisa melanjutkan tanpa foto.`
      );
      setCameraOpen(true);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Video kamera belum siap. Coba tunggu sebentar.");
      return;
    }

    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError("Gagal memproses gambar dari kamera.");
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    setPhotoDataUrl(dataUrl);
    if (photoInputRef.current) {
      photoInputRef.current.value = dataUrl;
    }
    stopCamera();
  }

  function executeWithGps(
    action: (formData: FormData) => void | Promise<void>
  ) {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const submitNow = () => {
      stopCamera();
      if (formRef.current) {
        const formData = new FormData(formRef.current);
        void action(formData);
      }
      setIsSubmitting(false);
      setPendingAction(null);
    };

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      if (latInputRef.current) latInputRef.current.value = "";
      if (lngInputRef.current) lngInputRef.current.value = "";
      setLokasiStatus(
        "Browser tidak mendukung Geolocation; absensi disimpan tanpa GPS."
      );
      submitNow();
      return;
    }

    setLokasiStatus("Mengambil koordinat GPS perangkat...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);

        if (latInputRef.current) latInputRef.current.value = lat;
        if (lngInputRef.current) lngInputRef.current.value = lng;

        setLokasiStatus(`GPS terdeteksi: ${lat}, ${lng}`);
        submitNow();
      },
      (geoError) => {
        if (latInputRef.current) latInputRef.current.value = "";
        if (lngInputRef.current) lngInputRef.current.value = "";

        setLokasiStatus(
          `GPS tidak tersedia (${geoError.message}); absensi tetap bisa dikirim tanpa koordinat.`
        );
        submitNow();
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  }

  function handlePrimaryButtonClick(mode: "checkin" | "checkout") {
    if (!isAdmin) {
      void openCameraFor(mode);
      return;
    }

    const action = mode === "checkin" ? checkInAction : checkOutAction;
    executeWithGps(action);
  }

  function handleConfirmEmployeeSubmit() {
    const mode = pendingAction ?? "checkin";
    const action = mode === "checkin" ? checkInAction : checkOutAction;
    executeWithGps(action);
  }

  return (
    <form
      ref={formRef}
      className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-4"
    >
      <input ref={latInputRef} type="hidden" name="latitude" defaultValue="" />
      <input ref={lngInputRef} type="hidden" name="longitude" defaultValue="" />
      <input
        ref={photoInputRef}
        type="hidden"
        name="foto_data_url"
        defaultValue=""
      />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {isAdmin && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Karyawan
            </label>
            <select
              name="karyawan_id"
              defaultValue={daftarKaryawan[0]?.id ?? ""}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-600"
            >
              {daftarKaryawan.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.NIK || "-"} — {k.Nama_lengkap || "Tanpa Nama"} (
                  {k.Jabatan || "-"})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={isAdmin ? "" : "sm:col-span-2"}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Catatan / Keterangan
          </label>
          <input
            type="text"
            name="keterangan"
            placeholder="Contoh: WFO Kantor / Kunjungan lapangan"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {!isAdmin && (cameraOpen || photoDataUrl || cameraError) && (
        <div className="rounded-xl border border-blue-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Kamera Verifikasi{" "}
              {pendingAction === "checkout" ? "Check-out" : "Check-in"}
            </p>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setPendingAction(null);
                setPhotoDataUrl("");
                if (photoInputRef.current) photoInputRef.current.value = "";
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Tutup
            </button>
          </div>

          {cameraError && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              {cameraError}
            </p>
          )}

          {cameraOpen && (
            <div className="space-y-3">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-64 w-full max-w-md rounded-lg border border-slate-300 bg-slate-950 object-cover"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                >
                  Ambil Foto
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmEmployeeSubmit}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Kirim Tanpa Foto
                </button>
              </div>
            </div>
          )}

          {photoDataUrl && (
            <div className="space-y-3">
              <img
                src={photoDataUrl}
                alt="Preview foto absensi"
                className="max-h-64 w-full max-w-md rounded-lg border border-slate-300 object-cover"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmEmployeeSubmit}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSubmitting
                    ? "Menyimpan..."
                    : pendingAction === "checkout"
                      ? "Simpan Check-out"
                      : "Simpan Check-in"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void openCameraFor(pendingAction ?? "checkin")}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Foto Ulang
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {lokasiStatus}
        </span>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handlePrimaryButtonClick("checkin")}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isSubmitting ? "Memproses..." : "Check-in"}
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handlePrimaryButtonClick("checkout")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isSubmitting ? "Memproses..." : "Check-out"}
          </button>
        </div>
      </div>
    </form>
  );
}