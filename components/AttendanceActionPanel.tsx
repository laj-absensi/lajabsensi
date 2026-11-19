"use client";

import { useEffect, useRef, useState } from "react";

export type EmployeeOption = {
  id: string;
  employee_code: string;
  full_name: string;
  position_title: string | null;
};

type AttendanceActionPanelProps = {
  isStaffOperator: boolean;
  employees: EmployeeOption[];
  activeWorkLocationName?: string | null;
  activeRadiusMeters?: number | null;
  checkInAction: (formData: FormData) => void | Promise<void>;
  checkOutAction: (formData: FormData) => void | Promise<void>;
};

export function AttendanceActionPanel({
  isStaffOperator,
  employees,
  activeWorkLocationName,
  activeRadiusMeters,
  checkInAction,
  checkOutAction,
}: AttendanceActionPanelProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [pendingMode, setPendingMode] = useState<"checkin" | "checkout" | null>(
    null
  );
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [gpsMessage, setGpsMessage] = useState(
    activeWorkLocationName
      ? `Lokasi kantor: ${activeWorkLocationName} (Radius ${activeRadiusMeters ?? 150}m)`
      : "Koordinat GPS akan diambil otomatis saat Check-in / Check-out."
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  async function openCamera(mode: "checkin" | "checkout") {
    setCameraError("");
    setPhotoPreview("");
    if (photoRef.current) photoRef.current.value = "";
    setPendingMode(mode);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        "Kamera tidak didukung di perangkat/browser ini. Anda tetap bisa mengirim tanpa foto."
      );
      setCameraOpen(true);
      return;
    }

    try {
      stopCamera();
      setPendingMode(mode);
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
      const msg = err instanceof Error ? err.message : "Kamera gagal dibuka";
      setCameraError(
        `Akses kamera gagal (${msg}). Anda tetap bisa melanjutkan tanpa foto.`
      );
      setCameraOpen(true);
    }
  }

  function takeSelfie() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Kamera belum siap. Silakan tunggu sebentar.");
      return;
    }
    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError("Gagal memproses gambar kamera.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    setPhotoPreview(dataUrl);
    if (photoRef.current) photoRef.current.value = dataUrl;
    stopCamera();
  }

  function submitWithLocation(
    action: (formData: FormData) => void | Promise<void>
  ) {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const finalize = () => {
      stopCamera();
      if (formRef.current) {
        const fd = new FormData(formRef.current);
        void action(fd);
      }
      setIsSubmitting(false);
      setPendingMode(null);
    };

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      if (latRef.current) latRef.current.value = "";
      if (lngRef.current) lngRef.current.value = "";
      setGpsMessage("Perangkat tidak mendukung GPS; absensi dikirim tanpa lokasi.");
      finalize();
      return;
    }

    setGpsMessage("Mengambil koordinat GPS perangkat...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        if (latRef.current) latRef.current.value = lat;
        if (lngRef.current) lngRef.current.value = lng;
        setGpsMessage(`GPS terdeteksi: ${lat}, ${lng}`);
        finalize();
      },
      (err) => {
        if (latRef.current) latRef.current.value = "";
        if (lngRef.current) lngRef.current.value = "";
        setGpsMessage(
          `GPS tidak tersedia (${err.message}); absensi dikirim tanpa koordinat.`
        );
        finalize();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  function handleActionClick(mode: "checkin" | "checkout") {
    if (!isStaffOperator) {
      void openCamera(mode);
      return;
    }
    submitWithLocation(mode === "checkin" ? checkInAction : checkOutAction);
  }

  return (
    <form
      ref={formRef}
      className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-4"
    >
      <input ref={latRef} type="hidden" name="latitude" defaultValue="" />
      <input ref={lngRef} type="hidden" name="longitude" defaultValue="" />
      <input ref={photoRef} type="hidden" name="photo_data_url" defaultValue="" />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {isStaffOperator && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Pilih Karyawan
            </label>
            <select
              name="employee_id"
              defaultValue={employees[0]?.id ?? ""}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-600"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} — {emp.full_name}
                  {emp.position_title ? ` (${emp.position_title})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={isStaffOperator ? "" : "sm:col-span-2"}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Catatan Kehadiran
          </label>
          <input
            type="text"
            name="notes"
            placeholder="Contoh: Masuk kantor / Tugas lapangan"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {!isStaffOperator && (cameraOpen || photoPreview || cameraError) && (
        <div className="rounded-xl border border-blue-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Foto Selfie {pendingMode === "checkout" ? "Check-out" : "Check-in"}
            </p>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setPendingMode(null);
                setPhotoPreview("");
                if (photoRef.current) photoRef.current.value = "";
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Batal
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
                  onClick={takeSelfie}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Ambil Foto Selfie
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() =>
                    submitWithLocation(
                      pendingMode === "checkout" ? checkOutAction : checkInAction
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Kirim Tanpa Foto
                </button>
              </div>
            </div>
          )}

          {photoPreview && (
            <div className="space-y-3">
              <img
                src={photoPreview}
                alt="Preview selfie absensi"
                className="max-h-64 w-full max-w-md rounded-lg border border-slate-300 object-cover"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() =>
                    submitWithLocation(
                      pendingMode === "checkout" ? checkOutAction : checkInAction
                    )
                  }
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSubmitting
                    ? "Menyimpan..."
                    : pendingMode === "checkout"
                      ? "Konfirmasi Check-out"
                      : "Konfirmasi Check-in"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void openCamera(pendingMode ?? "checkin")}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
          {gpsMessage}
        </span>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleActionClick("checkin")}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {isSubmitting ? "Memproses..." : "Check-in"}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleActionClick("checkout")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isSubmitting ? "Memproses..." : "Check-out"}
          </button>
        </div>
      </div>
    </form>
  );
}