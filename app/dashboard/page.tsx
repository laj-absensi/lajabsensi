import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AttendanceActionPanel,
  type EmployeeOption,
} from "@/components/AttendanceActionPanel";
import {
  AttendanceCharts,
  type LateStatPoint,
  type MonthlyStatPoint,
  type WeeklyStatPoint,
} from "@/components/AttendanceCharts";
import { createClient } from "@/lib/supabase-server";

type ProfileRow = {
  id: string;
  nama_lengkap: string | null;
  email: string | null;
  role: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
  description: string | null;
};

type PositionRow = {
  id: string;
  department_id: string | null;
  title: string;
};

type WorkLocationRow = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
};

type WorkShiftRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  is_active: boolean;
};

type EmployeeScheduleRow = {
  id: string;
  employee_id: string;
  shift_id: string;
  schedule_date: string;
  notes: string | null;
};

type OvertimeRequestRow = {
  id: string;
  employee_id: string;
  overtime_date: string;
  start_time: string;
  end_time: string;
  hours_worked: number;
  reason: string;
  status: string;
  created_at: string;
};

type LeaveRequestRow = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  recipient_user_id: string | null;
  title: string;
  message: string;
  category: string;
  is_read: boolean;
  created_at: string;
};

type AppSettingsRow = {
  id: number;
  company_name: string;
  timezone: string;
  default_work_start: string;
  default_work_end: string;
  default_grace_minutes: number;
  require_selfie: boolean;
  require_gps: boolean;
};

type EmployeeRow = {
  id: string;
  user_id: string | null;
  employee_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  department_id: string | null;
  position_id: string | null;
  work_location_id: string | null;
  join_date: string;
  status: string;
  avatar_url: string | null;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  user_id: string | null;
  attendance_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  distance_meters: number | null;
  within_radius: boolean;
  check_in_photo: string | null;
  check_out_photo: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type ActivityLogRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

type MenuKey =
  | "dashboard"
  | "karyawan"
  | "absensi"
  | "lokasi"
  | "wajah"
  | "jadwal"
  | "lembur"
  | "cuti"
  | "timesheet"
  | "laporan"
  | "notifikasi"
  | "log"
  | "pengaturan";

type DashboardPageProps = {
  searchParams: Promise<{
    menu?: string;
    tanggal?: string;
    departemenId?: string;
    q?: string;
    page?: string;
    status?: string;
    message?: string;
  }>;
};

const VALID_MENUS: MenuKey[] = [
  "dashboard",
  "karyawan",
  "absensi",
  "lokasi",
  "wajah",
  "jadwal",
  "lembur",
  "cuti",
  "timesheet",
  "laporan",
  "notifikasi",
  "log",
  "pengaturan",
];

function getTodayWita(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getWitaHourMinute(isoString: string | null): {
  hour: number;
  minute: number;
} | null {
  if (!isoString) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoString));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour: h, minute: m };
}

function formatTimeWita(isoString: string | null): string {
  if (!isoString) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(isoString));
}

function formatDateTimeWita(isoString: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function computeHoursBetween(startHm: string, endHm: string): number {
  const [sh, sm] = startHm.split(":").map(Number);
  const [eh, em] = endHm.split(":").map(Number);
  if (
    [sh, sm, eh, em].some((n) => Number.isNaN(n))
  ) {
    return 1;
  }
  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) {
    endMins += 24 * 60;
  }
  const diffHours = Math.max(0.5, (endMins - startMins) / 60);
  return Number(diffHours.toFixed(2));
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function parseCoord(val: FormDataEntryValue | null): number | null {
  if (typeof val !== "string" || !val.trim()) return null;
  const n = Number(val.trim());
  return Number.isFinite(n) ? n : null;
}

function parseSelfie(val: FormDataEntryValue | null): string | null {
  if (typeof val !== "string") return null;
  const s = val.trim();
  if (!s.startsWith("data:image/") || s.length > 1_500_000) return null;
  return s;
}

function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function shiftDateDays(baseDateStr: string, offsetDays: number): string {
  const [y, m, d] = baseDateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + offsetDays));
  return dt.toISOString().slice(0, 10);
}

function buildUrl(paramsObj: {
  menu: MenuKey;
  tanggal?: string;
  departemenId?: string;
  q?: string;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  sp.set("menu", paramsObj.menu);
  if (paramsObj.tanggal) sp.set("tanggal", paramsObj.tanggal);
  if (paramsObj.departemenId) sp.set("departemenId", paramsObj.departemenId);
  if (paramsObj.q) sp.set("q", paramsObj.q);
  if (paramsObj.page && paramsObj.page > 1) {
    sp.set("page", String(paramsObj.page));
  }
  return `/dashboard?${sp.toString()}`;
}
export const dynamic = "force-dynamic";
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nama_lengkap, email, role")
    .eq("id", user.id)
    .single<ProfileRow>();

  const normalizedRole = (profile?.role || "karyawan").toLowerCase();
  const isPrivileged = [
    "super_admin",
    "admin",
    "hrd",
    "manager",
  ].includes(normalizedRole);
  const canManageMaster = ["super_admin", "admin", "hrd"].includes(
    normalizedRole
  );

  const [
    { data: departmentsData },
    { data: positionsData },
    { data: locationsData },
    { data: shiftsData },
    { data: schedulesData },
    { data: overtimeData },
    { data: leavesData },
    { data: notificationsData },
    { data: settingsData },
    { data: employeesData },
    { data: attendanceData },
    { data: logsData },
  ] = await Promise.all([
    supabase
      .from("departments")
      .select("id, name, description")
      .order("name", { ascending: true })
      .returns<DepartmentRow[]>(),
    supabase
      .from("positions")
      .select("id, department_id, title")
      .order("title", { ascending: true })
      .returns<PositionRow[]>(),
    supabase
      .from("work_locations")
      .select("id, name, address, latitude, longitude, radius_meters, is_active")
      .order("created_at", { ascending: false })
      .returns<WorkLocationRow[]>(),
    supabase
      .from("work_shifts")
      .select("id, name, start_time, end_time, grace_minutes, is_active")
      .order("start_time", { ascending: true })
      .returns<WorkShiftRow[]>(),
    supabase
      .from("employee_schedules")
      .select("id, employee_id, shift_id, schedule_date, notes")
      .order("schedule_date", { ascending: false })
      .limit(100)
      .returns<EmployeeScheduleRow[]>(),
    supabase
      .from("overtime_requests")
      .select(
        "id, employee_id, overtime_date, start_time, end_time, hours_worked, reason, status, created_at"
      )
      .order("overtime_date", { ascending: false })
      .limit(100)
      .returns<OvertimeRequestRow[]>(),
    supabase
      .from("leave_requests")
      .select(
        "id, employee_id, leave_type, start_date, end_date, reason, status, created_at"
      )
      .order("start_date", { ascending: false })
      .limit(100)
      .returns<LeaveRequestRow[]>(),
    supabase
      .from("notifications")
      .select(
        "id, recipient_user_id, title, message, category, is_read, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<NotificationRow[]>(),
    supabase
      .from("app_settings")
      .select(
        "id, company_name, timezone, default_work_start, default_work_end, default_grace_minutes, require_selfie, require_gps"
      )
      .eq("id", 1)
      .maybeSingle<AppSettingsRow>(),
    supabase
      .from("employees")
      .select(
        "id, user_id, employee_code, full_name, email, phone, department_id, position_id, work_location_id, join_date, status, avatar_url"
      )
      .order("created_at", { ascending: true })
      .returns<EmployeeRow[]>(),
    supabase
      .from("attendance")
      .select(
        "id, employee_id, user_id, attendance_date, check_in_at, check_out_at, check_in_lat, check_in_lng, check_out_lat, check_out_lng, distance_meters, within_radius, check_in_photo, check_out_photo, status, notes, created_at"
      )
      .order("attendance_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<AttendanceRow[]>(),
    supabase
      .from("activity_logs")
      .select("id, actor_user_id, action, entity_type, entity_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<ActivityLogRow[]>(),
  ]);

  const departments = departmentsData ?? [];
  const positions = positionsData ?? [];
  const locations = locationsData ?? [];
  const shifts = shiftsData ?? [];
  const schedules = schedulesData ?? [];
  const overtimeList = overtimeData ?? [];
  const leaveList = leavesData ?? [];
  const notifications = notificationsData ?? [];
  const settings: AppSettingsRow = settingsData ?? {
    id: 1,
    company_name: "LAJAbsensi",
    timezone: "Asia/Makassar",
    default_work_start: "08:00",
    default_work_end: "17:00",
    default_grace_minutes: 15,
    require_selfie: true,
    require_gps: true,
  };
  const employees = employeesData ?? [];
  const attendanceList = attendanceData ?? [];
  const logs = logsData ?? [];

  const todayWita = getTodayWita();
  const activeMenu: MenuKey = VALID_MENUS.includes(params?.menu as MenuKey)
    ? (params.menu as MenuKey)
    : "dashboard";

  const filterTanggal = (params?.tanggal || "").trim();
  const filterDeptId = (params?.departemenId || "").trim();
  const searchQuery = (params?.q || "").trim().toLowerCase();
  const currentPage = Math.max(1, Number(params?.page || 1) || 1);
  const pageSize = 8;

  const deptMap = new Map<string, DepartmentRow>();
  for (const d of departments) deptMap.set(d.id, d);

  const posMap = new Map<string, PositionRow>();
  for (const p of positions) posMap.set(p.id, p);

  const empMap = new Map<string, EmployeeRow>();
  for (const e of employees) empMap.set(e.id, e);

  const shiftMap = new Map<string, WorkShiftRow>();
  for (const sh of shifts) shiftMap.set(sh.id, sh);

  const activeLocation =
    locations.find((l) => l.is_active) ?? locations[0] ?? null;

  const ownEmployee = employees.find((e) => e.user_id === user.id) ?? null;
  const unreadNotifCount = notifications.filter((n) => !n.is_read).length;

  // Server Actions
  async function signOutAction() {
    "use server";
    const s = await createClient();
    await s.auth.signOut();
    redirect("/login");
  }

  async function addDepartmentAction(formData: FormData) {
    "use server";
    const name = String(formData.get("dept_name") ?? "").trim();
    const description = String(formData.get("dept_desc") ?? "").trim() || null;
    if (!name) {
      redirect(
        `/dashboard?menu=karyawan&status=error&message=${encodeURIComponent(
          "Nama departemen wajib diisi."
        )}`
      );
    }
    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { error } = await s
      .from("departments")
      .insert({ name, description });
    if (error) {
      redirect(
        `/dashboard?menu=karyawan&status=error&message=${encodeURIComponent(
          `Gagal menambah departemen: ${error.message}`
        )}`
      );
    }
    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "CREATE_DEPARTMENT",
      entity_type: "departments",
      entity_id: name,
    });
    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=karyawan&status=success&message=${encodeURIComponent(
        `Departemen "${name}" berhasil ditambahkan.`
      )}`
    );
  }

  async function addPositionAction(formData: FormData) {
    "use server";
    const title = String(formData.get("pos_title") ?? "").trim();
    const deptId = String(formData.get("pos_dept_id") ?? "").trim() || null;
    if (!title) {
      redirect(
        `/dashboard?menu=karyawan&status=error&message=${encodeURIComponent(
          "Nama jabatan wajib diisi."
        )}`
      );
    }
    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { error } = await s
      .from("positions")
      .insert({ title, department_id: deptId });
    if (error) {
      redirect(
        `/dashboard?menu=karyawan&status=error&message=${encodeURIComponent(
          `Gagal menambah jabatan: ${error.message}`
        )}`
      );
    }
    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "CREATE_POSITION",
      entity_type: "positions",
      entity_id: title,
    });
    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=karyawan&status=success&message=${encodeURIComponent(
        `Jabatan "${title}" berhasil ditambahkan.`
      )}`
    );
  }

  async function addEmployeeAction(formData: FormData) {
    "use server";
    const code = String(formData.get("employee_code") ?? "").trim();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const departmentId =
      String(formData.get("department_id") ?? "").trim() || null;
    const positionId = String(formData.get("position_id") ?? "").trim() || null;
    const joinDate =
      String(formData.get("join_date") ?? "").trim() || getTodayWita();
    const status = String(formData.get("emp_status") ?? "aktif").trim();
    const userIdRaw = String(formData.get("user_id") ?? "").trim();
    const userId = userIdRaw || null;

    if (!code || !fullName || !email) {
      redirect(
        `/dashboard?menu=karyawan&status=error&message=${encodeURIComponent(
          "ID Karyawan, Nama Lengkap, dan Email wajib diisi."
        )}`
      );
    }

    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { error } = await s.from("employees").insert({
      employee_code: code,
      full_name: fullName,
      email,
      phone,
      department_id: departmentId,
      position_id: positionId,
      work_location_id: activeLocation?.id ?? null,
      join_date: joinDate,
      status,
      user_id: userId,
    });

    if (error) {
      redirect(
        `/dashboard?menu=karyawan&status=error&message=${encodeURIComponent(
          `Gagal menambah karyawan: ${error.message}`
        )}`
      );
    }

    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "CREATE_EMPLOYEE",
      entity_type: "employees",
      entity_id: code,
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=karyawan&status=success&message=${encodeURIComponent(
        `Karyawan "${fullName}" (${code}) berhasil disimpan.`
      )}`
    );
  }

  async function saveWorkLocationAction(formData: FormData) {
    "use server";
    const name = String(formData.get("loc_name") ?? "").trim();
    const address = String(formData.get("loc_address") ?? "").trim() || null;
    const lat = Number(formData.get("loc_lat") ?? 0);
    const lng = Number(formData.get("loc_lng") ?? 0);
    const radius = Math.max(
      10,
      Number(formData.get("loc_radius") ?? 150) || 150
    );

    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      redirect(
        `/dashboard?menu=lokasi&status=error&message=${encodeURIComponent(
          "Nama lokasi, Latitude, dan Longitude valid wajib diisi."
        )}`
      );
    }

    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { error } = await s.from("work_locations").insert({
      name,
      address,
      latitude: lat,
      longitude: lng,
      radius_meters: radius,
      is_active: true,
    });

    if (error) {
      redirect(
        `/dashboard?menu=lokasi&status=error&message=${encodeURIComponent(
          `Gagal menyimpan lokasi kantor: ${error.message}`
        )}`
      );
    }

    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "CREATE_WORK_LOCATION",
      entity_type: "work_locations",
      entity_id: name,
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=lokasi&status=success&message=${encodeURIComponent(
        `Lokasi kantor "${name}" (radius ${radius}m) tersimpan.`
      )}`
    );
  }

  async function addWorkShiftAction(formData: FormData) {
    "use server";
    const name = String(formData.get("shift_name") ?? "").trim();
    const startTime = String(formData.get("start_time") ?? "").trim();
    const endTime = String(formData.get("end_time") ?? "").trim();
    const graceMinutes = Math.max(
      0,
      Number(formData.get("grace_minutes") ?? 15) || 0
    );

    if (!name || !startTime || !endTime) {
      redirect(
        `/dashboard?menu=jadwal&status=error&message=${encodeURIComponent(
          "Nama shift, jam mulai, dan jam selesai wajib diisi."
        )}`
      );
    }

    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { error } = await s.from("work_shifts").insert({
      name,
      start_time: startTime,
      end_time: endTime,
      grace_minutes: graceMinutes,
      is_active: true,
    });

    if (error) {
      redirect(
        `/dashboard?menu=jadwal&status=error&message=${encodeURIComponent(
          `Gagal menambah shift: ${error.message}`
        )}`
      );
    }

    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "CREATE_WORK_SHIFT",
      entity_type: "work_shifts",
      entity_id: name,
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=jadwal&status=success&message=${encodeURIComponent(
        `Shift kerja "${name}" berhasil ditambahkan.`
      )}`
    );
  }

  async function assignScheduleAction(formData: FormData) {
    "use server";
    const employeeId = String(formData.get("schedule_employee_id") ?? "").trim();
    const shiftId = String(formData.get("schedule_shift_id") ?? "").trim();
    const scheduleDate =
      String(formData.get("schedule_date") ?? "").trim() || getTodayWita();
    const notes = String(formData.get("schedule_notes") ?? "").trim() || null;

    if (!employeeId || !shiftId) {
      redirect(
        `/dashboard?menu=jadwal&status=error&message=${encodeURIComponent(
          "Karyawan dan shift wajib dipilih."
        )}`
      );
    }

    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { error } = await s.from("employee_schedules").upsert(
      {
        employee_id: employeeId,
        shift_id: shiftId,
        schedule_date: scheduleDate,
        notes,
      },
      { onConflict: "employee_id,schedule_date" }
    );

    if (error) {
      redirect(
        `/dashboard?menu=jadwal&status=error&message=${encodeURIComponent(
          `Gagal menetapkan jadwal: ${error.message}`
        )}`
      );
    }

    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "ASSIGN_SCHEDULE",
      entity_type: "employee_schedules",
      entity_id: scheduleDate,
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=jadwal&status=success&message=${encodeURIComponent(
        `Jadwal kerja tanggal ${scheduleDate} berhasil disimpan.`
      )}`
    );
  }

  async function createOvertimeAction(formData: FormData) {
    "use server";
    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { data: prof } = await s
      .from("profiles")
      .select("role")
      .eq("id", u.id)
      .single<{ role: string | null }>();
    const roleNow = (prof?.role || "karyawan").toLowerCase();
    const operatorMode = ["super_admin", "admin", "hrd"].includes(roleNow);

    const selectedEmpId = String(formData.get("ot_employee_id") ?? "").trim();
    const overtimeDate =
      String(formData.get("ot_date") ?? "").trim() || getTodayWita();
    const startTime = String(formData.get("ot_start") ?? "17:00").trim();
    const endTime = String(formData.get("ot_end") ?? "19:00").trim();
    const reason = String(formData.get("ot_reason") ?? "").trim();

    let targetEmpId = selectedEmpId;
    if (!operatorMode) {
      const { data: own } = await s
        .from("employees")
        .select("id")
        .eq("user_id", u.id)
        .maybeSingle<{ id: string }>();
      targetEmpId = own?.id ?? "";
    }

    if (!targetEmpId || !reason) {
      redirect(
        `/dashboard?menu=lembur&status=error&message=${encodeURIComponent(
          "Karyawan dan alasan lembur wajib diisi."
        )}`
      );
    }

    const hoursWorked = computeHoursBetween(startTime, endTime);

    const { error } = await s.from("overtime_requests").insert({
      employee_id: targetEmpId,
      overtime_date: overtimeDate,
      start_time: startTime,
      end_time: endTime,
      hours_worked: hoursWorked,
      reason,
      status: "pending",
    });

    if (error) {
      redirect(
        `/dashboard?menu=lembur&status=error&message=${encodeURIComponent(
          `Gagal mengajukan lembur: ${error.message}`
        )}`
      );
    }

    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "CREATE_OVERTIME",
      entity_type: "overtime_requests",
      entity_id: overtimeDate,
    });

    await s.from("notifications").insert({
      title: "Pengajuan Lembur Baru",
      message: `Lembur pada ${overtimeDate} (${hoursWorked} jam) diajukan: ${reason}`,
      category: "lembur",
      is_read: false,
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=lembur&status=success&message=${encodeURIComponent(
        `Pengajuan lembur tanggal ${overtimeDate} (${hoursWorked} jam) berhasil dikirim.`
      )}`
    );
  }

  async function reviewOvertimeAction(formData: FormData) {
    "use server";
    const id = String(formData.get("overtime_id") ?? "").trim();
    const decision = String(formData.get("decision") ?? "").trim();
    if (!id || !["approved", "rejected"].includes(decision)) return;

    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { error } = await s
      .from("overtime_requests")
      .update({
        status: decision,
        reviewed_by: u.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (!error) {
      await s.from("activity_logs").insert({
        actor_user_id: u.id,
        action:
          decision === "approved" ? "APPROVE_OVERTIME" : "REJECT_OVERTIME",
        entity_type: "overtime_requests",
        entity_id: id,
      });
      await s.from("notifications").insert({
        title:
          decision === "approved"
            ? "Pengajuan Lembur Disetujui"
            : "Pengajuan Lembur Ditolak",
        message: `Status pengajuan lembur diperbarui menjadi ${decision}.`,
        category: "lembur",
        is_read: false,
      });
    }

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=lembur&status=success&message=${encodeURIComponent(
        `Pengajuan lembur diperbarui menjadi "${decision}".`
      )}`
    );
  }

  async function createLeaveAction(formData: FormData) {
    "use server";
    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { data: prof } = await s
      .from("profiles")
      .select("role")
      .eq("id", u.id)
      .single<{ role: string | null }>();
    const roleNow = (prof?.role || "karyawan").toLowerCase();
    const operatorMode = ["super_admin", "admin", "hrd"].includes(roleNow);

    const selectedEmpId = String(formData.get("leave_employee_id") ?? "").trim();
    const leaveType = String(formData.get("leave_type") ?? "izin").trim();
    const startDate =
      String(formData.get("leave_start") ?? "").trim() || getTodayWita();
    const endDate =
      String(formData.get("leave_end") ?? "").trim() || startDate;
    const reason = String(formData.get("leave_reason") ?? "").trim();

    let targetEmpId = selectedEmpId;
    if (!operatorMode) {
      const { data: own } = await s
        .from("employees")
        .select("id")
        .eq("user_id", u.id)
        .maybeSingle<{ id: string }>();
      targetEmpId = own?.id ?? "";
    }

    if (!targetEmpId || !reason) {
      redirect(
        `/dashboard?menu=cuti&status=error&message=${encodeURIComponent(
          "Karyawan dan keterangan/alasan cuti atau izin wajib diisi."
        )}`
      );
    }

    const { error } = await s.from("leave_requests").insert({
      employee_id: targetEmpId,
      leave_type: ["cuti", "izin", "sakit"].includes(leaveType)
        ? leaveType
        : "izin",
      start_date: startDate,
      end_date: endDate < startDate ? startDate : endDate,
      reason,
      status: "pending",
    });

    if (error) {
      redirect(
        `/dashboard?menu=cuti&status=error&message=${encodeURIComponent(
          `Gagal mengajukan cuti/izin: ${error.message}`
        )}`
      );
    }

    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "CREATE_LEAVE_REQUEST",
      entity_type: "leave_requests",
      entity_id: startDate,
    });

    await s.from("notifications").insert({
      title: `Pengajuan ${leaveType.toUpperCase()} Baru`,
      message: `Periode ${startDate} s/d ${endDate}: ${reason}`,
      category: "cuti",
      is_read: false,
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=cuti&status=success&message=${encodeURIComponent(
        `Pengajuan ${leaveType} (${startDate} s/d ${endDate}) berhasil dikirim.`
      )}`
    );
  }

  async function reviewLeaveAction(formData: FormData) {
    "use server";
    const id = String(formData.get("leave_id") ?? "").trim();
    const decision = String(formData.get("decision") ?? "").trim();
    if (!id || !["approved", "rejected"].includes(decision)) return;

    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { error } = await s
      .from("leave_requests")
      .update({
        status: decision,
        reviewed_by: u.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (!error) {
      await s.from("activity_logs").insert({
        actor_user_id: u.id,
        action: decision === "approved" ? "APPROVE_LEAVE" : "REJECT_LEAVE",
        entity_type: "leave_requests",
        entity_id: id,
      });
      await s.from("notifications").insert({
        title:
          decision === "approved"
            ? "Pengajuan Cuti/Izin Disetujui"
            : "Pengajuan Cuti/Izin Ditolak",
        message: `Status pengajuan cuti/izin diperbarui menjadi ${decision}.`,
        category: "cuti",
        is_read: false,
      });
    }

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=cuti&status=success&message=${encodeURIComponent(
        `Pengajuan cuti/izin diperbarui menjadi "${decision}".`
      )}`
    );
  }

  async function markAllNotificationsReadAction() {
    "use server";
    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    await s.from("notifications").update({ is_read: true }).eq("is_read", false);
    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "MARK_NOTIFICATIONS_READ",
      entity_type: "notifications",
      entity_id: "all",
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=notifikasi&status=success&message=${encodeURIComponent(
        "Semua notifikasi telah ditandai sudah dibaca."
      )}`
    );
  }

  async function saveAppSettingsAction(formData: FormData) {
    "use server";
    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const companyName =
      String(formData.get("company_name") ?? "LAJAbsensi").trim() ||
      "LAJAbsensi";
    const timezone =
      String(formData.get("timezone") ?? "Asia/Makassar").trim() ||
      "Asia/Makassar";
    const defaultWorkStart = String(
      formData.get("default_work_start") ?? "08:00"
    ).trim();
    const defaultWorkEnd = String(
      formData.get("default_work_end") ?? "17:00"
    ).trim();
    const defaultGraceMinutes = Math.max(
      0,
      Number(formData.get("default_grace_minutes") ?? 15) || 0
    );
    const requireSelfie = formData.get("require_selfie") === "on";
    const requireGps = formData.get("require_gps") === "on";

    const { error } = await s.from("app_settings").upsert(
      {
        id: 1,
        company_name: companyName,
        timezone,
        default_work_start: defaultWorkStart,
        default_work_end: defaultWorkEnd,
        default_grace_minutes: defaultGraceMinutes,
        require_selfie: requireSelfie,
        require_gps: requireGps,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      redirect(
        `/dashboard?menu=pengaturan&status=error&message=${encodeURIComponent(
          `Gagal menyimpan pengaturan: ${error.message}`
        )}`
      );
    }

    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "UPDATE_APP_SETTINGS",
      entity_type: "app_settings",
      entity_id: "1",
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=pengaturan&status=success&message=${encodeURIComponent(
        "Pengaturan aplikasi LAJAbsensi berhasil disimpan."
      )}`
    );
  }

  async function checkInAction(formData: FormData) {
    "use server";
    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { data: prof } = await s
      .from("profiles")
      .select("role")
      .eq("id", u.id)
      .single<{ role: string | null }>();
    const roleNow = (prof?.role || "karyawan").toLowerCase();
    const operatorMode = ["super_admin", "admin", "hrd"].includes(roleNow);

    const selectedEmpId = String(formData.get("employee_id") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const lat = parseCoord(formData.get("latitude"));
    const lng = parseCoord(formData.get("longitude"));
    const selfie = !operatorMode
      ? parseSelfie(formData.get("photo_data_url"))
      : null;
    const today = getTodayWita();

    let targetEmp: EmployeeRow | null = null;
    if (operatorMode && selectedEmpId) {
      const { data: found } = await s
        .from("employees")
        .select(
          "id, user_id, employee_code, full_name, email, phone, department_id, position_id, work_location_id, join_date, status, avatar_url"
        )
        .eq("id", selectedEmpId)
        .single<EmployeeRow>();
      targetEmp = found ?? null;
    } else {
      const { data: own } = await s
        .from("employees")
        .select(
          "id, user_id, employee_code, full_name, email, phone, department_id, position_id, work_location_id, join_date, status, avatar_url"
        )
        .eq("user_id", u.id)
        .maybeSingle<EmployeeRow>();
      targetEmp = own ?? null;
    }

    if (!targetEmp) {
      redirect(
        `/dashboard?menu=absensi&status=error&message=${encodeURIComponent(
          "Data karyawan belum ditemukan atau belum terhubung dengan akun login Anda."
        )}`
      );
    }

    const { data: dup } = await s
      .from("attendance")
      .select("id, check_in_at")
      .eq("employee_id", targetEmp.id)
      .eq("attendance_date", today)
      .maybeSingle<{ id: string; check_in_at: string | null }>();

    if (dup?.check_in_at) {
      redirect(
        `/dashboard?menu=absensi&status=error&message=${encodeURIComponent(
          `${targetEmp.full_name} sudah melakukan Check-in pada ${today}.`
        )}`
      );
    }

    const nowIso = new Date().toISOString();
    const hm = getWitaHourMinute(nowIso);
    const isLate = hm
      ? hm.hour > 8 || (hm.hour === 8 && hm.minute > settings.default_grace_minutes)
      : false;
    const statusLabel = isLate ? "terlambat" : "hadir";

    let distanceMeters: number | null = null;
    let withinRadius = true;
    if (
      activeLocation &&
      typeof lat === "number" &&
      typeof lng === "number"
    ) {
      distanceMeters = haversineMeters(
        lat,
        lng,
        activeLocation.latitude,
        activeLocation.longitude
      );
      withinRadius = distanceMeters <= activeLocation.radius_meters;
    }

    const { error: insErr } = await s.from("attendance").insert({
      employee_id: targetEmp.id,
      user_id: targetEmp.user_id || u.id,
      attendance_date: today,
      check_in_at: nowIso,
      check_in_lat: lat,
      check_in_lng: lng,
      distance_meters: distanceMeters,
      within_radius: withinRadius,
      check_in_photo: selfie,
      status: statusLabel,
      notes,
    });

    if (insErr) {
      redirect(
        `/dashboard?menu=absensi&status=error&message=${encodeURIComponent(
          `Gagal check-in: ${insErr.message}`
        )}`
      );
    }

    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "CHECK_IN",
      entity_type: "attendance",
      entity_id: targetEmp.employee_code,
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=absensi&status=success&message=${encodeURIComponent(
        `Check-in ${targetEmp.full_name} tercatat (${statusLabel.toUpperCase()})${
          distanceMeters !== null ? ` • Jarak kantor: ${distanceMeters}m` : ""
        }.`
      )}`
    );
  }

  async function checkOutAction(formData: FormData) {
    "use server";
    const s = await createClient();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) redirect("/login");

    const { data: prof } = await s
      .from("profiles")
      .select("role")
      .eq("id", u.id)
      .single<{ role: string | null }>();
    const roleNow = (prof?.role || "karyawan").toLowerCase();
    const operatorMode = ["super_admin", "admin", "hrd"].includes(roleNow);

    const selectedEmpId = String(formData.get("employee_id") ?? "").trim();
    const lat = parseCoord(formData.get("latitude"));
    const lng = parseCoord(formData.get("longitude"));
    const selfie = !operatorMode
      ? parseSelfie(formData.get("photo_data_url"))
      : null;
    const today = getTodayWita();

    let targetEmp: EmployeeRow | null = null;
    if (operatorMode && selectedEmpId) {
      const { data: found } = await s
        .from("employees")
        .select(
          "id, user_id, employee_code, full_name, email, phone, department_id, position_id, work_location_id, join_date, status, avatar_url"
        )
        .eq("id", selectedEmpId)
        .single<EmployeeRow>();
      targetEmp = found ?? null;
    } else {
      const { data: own } = await s
        .from("employees")
        .select(
          "id, user_id, employee_code, full_name, email, phone, department_id, position_id, work_location_id, join_date, status, avatar_url"
        )
        .eq("user_id", u.id)
        .maybeSingle<EmployeeRow>();
      targetEmp = own ?? null;
    }

    if (!targetEmp) {
      redirect(
        `/dashboard?menu=absensi&status=error&message=${encodeURIComponent(
          "Data karyawan belum ditemukan."
        )}`
      );
    }

    const { data: todayRow } = await s
      .from("attendance")
      .select("id, check_in_at, check_out_at")
      .eq("employee_id", targetEmp.id)
      .eq("attendance_date", today)
      .maybeSingle<{
        id: string;
        check_in_at: string | null;
        check_out_at: string | null;
      }>();

    if (!todayRow?.check_in_at) {
      redirect(
        `/dashboard?menu=absensi&status=error&message=${encodeURIComponent(
          `Belum ada Check-in hari ini (${today}) untuk ${targetEmp.full_name}.`
        )}`
      );
    }

    if (todayRow.check_out_at) {
      redirect(
        `/dashboard?menu=absensi&status=error&message=${encodeURIComponent(
          `${targetEmp.full_name} sudah melakukan Check-out hari ini (${today}).`
        )}`
      );
    }

    const { error: updErr } = await s
      .from("attendance")
      .update({
        check_out_at: new Date().toISOString(),
        check_out_lat: lat,
        check_out_lng: lng,
        check_out_photo: selfie,
      })
      .eq("id", todayRow.id);

    if (updErr) {
      redirect(
        `/dashboard?menu=absensi&status=error&message=${encodeURIComponent(
          `Gagal check-out: ${updErr.message}`
        )}`
      );
    }

    await s.from("activity_logs").insert({
      actor_user_id: u.id,
      action: "CHECK_OUT",
      entity_type: "attendance",
      entity_id: targetEmp.employee_code,
    });

    revalidatePath("/dashboard");
    redirect(
      `/dashboard?menu=absensi&status=success&message=${encodeURIComponent(
        `Check-out berhasil dicatat untuk ${targetEmp.full_name} pada ${today}.`
      )}`
    );
  }

  // Perhitungan 6 Kartu Statistik Hari Ini (WITA) dari data aktual
  const todayAttendance = attendanceList.filter(
    (a) => a.attendance_date === todayWita
  );
  const hadirHariIniCount = todayAttendance.filter((a) =>
    ["hadir", "terlambat"].includes(a.status.toLowerCase())
  ).length;
  const terlambatHariIniCount = todayAttendance.filter(
    (a) => a.status.toLowerCase() === "terlambat"
  ).length;
  const izinCutiHariIniCount = todayAttendance.filter((a) =>
    ["izin", "cuti"].includes(a.status.toLowerCase())
  ).length;
  const sedangBekerjaCount = todayAttendance.filter(
    (a) => Boolean(a.check_in_at) && !a.check_out_at
  ).length;
  const tidakHadirHariIniCount = Math.max(
    0,
    employees.length - hadirHariIniCount - izinCutiHariIniCount
  );

  const checkedInEmpIds = new Set(
    todayAttendance
      .filter((a) => Boolean(a.check_in_at))
      .map((a) => a.employee_id)
  );
  const belumCheckInEmployees = employees.filter(
    (e) => !checkedInEmpIds.has(e.id)
  );

  // Data Grafik Aktual
  const last7Dates = Array.from({ length: 7 }, (_, idx) =>
    shiftDateDays(todayWita, -(6 - idx))
  );

  const weeklyData: WeeklyStatPoint[] = last7Dates.map((dStr) => {
    const rowsForDay = attendanceList.filter((a) => a.attendance_date === dStr);
    const hadir = rowsForDay.filter(
      (r) => r.status.toLowerCase() === "hadir"
    ).length;
    const terlambat = rowsForDay.filter(
      (r) => r.status.toLowerCase() === "terlambat"
    ).length;
    return {
      label: dStr.slice(5),
      hadir,
      terlambat,
    };
  });

  const lateData: LateStatPoint[] = last7Dates.map((dStr) => {
    const jumlahTerlambat = attendanceList.filter(
      (r) =>
        r.attendance_date === dStr && r.status.toLowerCase() === "terlambat"
    ).length;
    return {
      label: dStr.slice(5),
      jumlahTerlambat,
    };
  });

  const [ty, tm] = todayWita.split("-").map(Number);
  const monthlyData: MonthlyStatPoint[] = Array.from({ length: 6 }, (_, idx) => {
    const monthOffset = -(5 - idx);
    const dt = new Date(Date.UTC(ty, (tm || 1) - 1 + monthOffset, 1));
    const ym = dt.toISOString().slice(0, 7);
    const totalHadir = attendanceList.filter(
      (r) =>
        r.attendance_date.startsWith(ym) &&
        ["hadir", "terlambat"].includes(r.status.toLowerCase())
    ).length;
    return {
      label: ym,
      totalHadir,
    };
  });

  // Filter & Pencarian Tabel Absensi
  const filteredAttendance = attendanceList.filter((row) => {
    const emp = empMap.get(row.employee_id);
    if (filterTanggal && row.attendance_date !== filterTanggal) return false;
    if (filterDeptId && emp?.department_id !== filterDeptId) return false;
    if (searchQuery) {
      const hay = `${emp?.full_name ?? ""} ${emp?.employee_code ?? ""} ${
        row.status
      } ${row.notes ?? ""}`.toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });

  // Filter Jadwal Kerja
  const filteredSchedules = schedules.filter((sc) => {
    const emp = empMap.get(sc.employee_id);
    if (filterTanggal && sc.schedule_date !== filterTanggal) return false;
    if (filterDeptId && emp?.department_id !== filterDeptId) return false;
    if (searchQuery) {
      const shName = shiftMap.get(sc.shift_id)?.name ?? "";
      const hay = `${emp?.full_name ?? ""} ${emp?.employee_code ?? ""} ${shName} ${
        sc.notes ?? ""
      }`.toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAttendance.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedAttendance = filteredAttendance.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  // CSV Export (kompatibel Excel)
  const csvRows = [
    [
      "Tanggal",
      "ID Karyawan",
      "Nama Lengkap",
      "Departemen",
      "Jam Masuk",
      "Jam Pulang",
      "Status",
      "Jarak Kantor (m)",
      "Dalam Radius",
      "Latitude",
      "Longitude",
      "Catatan",
    ]
      .map(csvCell)
      .join(","),
    ...filteredAttendance.map((r) => {
      const emp = empMap.get(r.employee_id);
      const dept = emp?.department_id ? deptMap.get(emp.department_id) : null;
      return [
        r.attendance_date,
        emp?.employee_code ?? "",
        emp?.full_name ?? "",
        dept?.name ?? "",
        formatTimeWita(r.check_in_at),
        formatTimeWita(r.check_out_at),
        r.status,
        r.distance_meters ?? "",
        r.within_radius ? "Ya" : "Tidak",
        r.check_in_lat ?? "",
        r.check_in_lng ?? "",
        r.notes ?? "",
      ]
        .map(csvCell)
        .join(",");
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    csvRows.join("\n")
  )}`;

  const employeeOptions: EmployeeOption[] = employees.map((e) => ({
    id: e.id,
    employee_code: e.employee_code,
    full_name: e.full_name,
    position_title: e.position_id
      ? posMap.get(e.position_id)?.title ?? null
      : null,
  }));

  const displayName =
    profile?.nama_lengkap?.trim() ||
    ownEmployee?.full_name ||
    user.email ||
    "Pengguna LAJAbsensi";

  const sidebarMenus: Array<{
    key: MenuKey;
    label: string;
    group: "Utama" | "Operasional" | "Analisis & Sistem";
    badge?: number;
  }> = [
    { key: "dashboard", label: "Dashboard", group: "Utama" },
    {
      key: "karyawan",
      label: "Data Karyawan",
      group: "Utama",
      badge: employees.length,
    },
    {
      key: "absensi",
      label: "Absensi",
      group: "Utama",
      badge: hadirHariIniCount,
    },
    { key: "lokasi", label: "Lokasi & GPS", group: "Operasional" },
    { key: "wajah", label: "Verifikasi Wajah", group: "Operasional" },
    {
      key: "jadwal",
      label: "Jadwal & Shift",
      group: "Operasional",
      badge: schedules.length,
    },
    {
      key: "lembur",
      label: "Lembur",
      group: "Operasional",
      badge: overtimeList.length,
    },
    {
      key: "cuti",
      label: "Cuti & Izin",
      group: "Operasional",
      badge: leaveList.length,
    },
    { key: "timesheet", label: "Timesheet", group: "Analisis & Sistem" },
    { key: "laporan", label: "Laporan", group: "Analisis & Sistem" },
    {
      key: "notifikasi",
      label: "Notifikasi",
      group: "Analisis & Sistem",
      badge: unreadNotifCount,
    },
    {
      key: "log",
      label: "Log Aktivitas",
      group: "Analisis & Sistem",
      badge: logs.length,
    },
    { key: "pengaturan", label: "Pengaturan", group: "Analisis & Sistem" },
  ];

  const groups: Array<"Utama" | "Operasional" | "Analisis & Sistem"> = [
    "Utama",
    "Operasional",
    "Analisis & Sistem",
  ];

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1520px] flex-col lg:flex-row">
        {/* Sidebar Navigasi LAJAbsensi */}
        <aside className="border-b border-slate-200 bg-white lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 lg:px-5 lg:py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-xs font-extrabold tracking-tight text-white shadow-xs">
                LA
              </div>
              <div>
                <p className="text-sm font-bold tracking-tight text-slate-900">
                  {settings.company_name}
                </p>
                <p className="text-[11px] text-slate-500">
                  Manajemen Kehadiran
                </p>
              </div>
            </div>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
              {normalizedRole}
            </span>
          </div>

          <nav
            aria-label="Menu Sidebar LAJAbsensi"
            className="flex gap-2 overflow-x-auto px-3 py-2.5 lg:block lg:space-y-4 lg:overflow-visible lg:px-3 lg:py-4"
          >
            {groups.map((grp) => (
              <div
                key={grp}
                className="flex shrink-0 gap-1.5 lg:block lg:space-y-1"
              >
                <p className="hidden px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:block">
                  {grp}
                </p>
                {sidebarMenus
                  .filter((m) => m.group === grp)
                  .map((item) => {
                    const active = activeMenu === item.key;
                    return (
                      <a
                        key={item.key}
                        href={buildUrl({
                          menu: item.key,
                          tanggal: filterTanggal || undefined,
                          departemenId: filterDeptId || undefined,
                          q: searchQuery || undefined,
                        })}
                        className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
                          active
                            ? "bg-blue-600 text-white shadow-2xs"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <span>{item.label}</span>
                        {typeof item.badge === "number" && (
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                              active
                                ? "bg-blue-500 text-white"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </a>
                    );
                  })}
              </div>
            ))}
          </nav>

          <div className="hidden border-t border-slate-100 p-4 lg:block">
            <p className="truncate text-xs font-semibold text-slate-800">
              {displayName}
            </p>
            <p className="truncate text-[11px] text-slate-500">
              {profile?.email || user.email}
            </p>
            <p className="mt-2 text-[11px] font-medium text-blue-700">
              {todayWita} • WITA
            </p>
          </div>
        </aside>

        {/* Konten Utama */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header Navigasi Atas */}
          <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div>
              <h1 className="text-base sm:text-lg font-bold capitalize text-slate-900">
                {settings.company_name} — {activeMenu}
              </h1>
              <p className="text-xs text-slate-500">
                {displayName} • Peran{" "}
                <span className="font-semibold uppercase text-blue-700">
                  {normalizedRole}
                </span>{" "}
                • {todayWita} WITA
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isPrivileged && (
                <a
                  href={csvHref}
                  download={`lajabsensi-rekap-${filterTanggal || todayWita}.csv`}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Export Excel (.CSV)
                </a>
              )}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Keluar
                </button>
              </form>
            </div>
          </header>

          <div className="space-y-5 p-4 sm:p-6">
            {params?.message && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
                  params.status === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                {params.message}
              </div>
            )}

            {/* Filter Tanggal & Departemen Global */}
            <form
              method="GET"
              action="/dashboard"
              className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs"
            >
              <input type="hidden" name="menu" value={activeMenu} />
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Tanggal
                </label>
                <input
                  type="date"
                  name="tanggal"
                  defaultValue={filterTanggal}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Departemen
                </label>
                <select
                  name="departemenId"
                  defaultValue={filterDeptId}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-600"
                >
                  <option value="">Semua Departemen</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-44 flex-1 sm:flex-initial">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Pencarian
                </label>
                <input
                  type="text"
                  name="q"
                  defaultValue={params?.q ?? ""}
                  placeholder="Nama / ID / Status..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Terapkan
              </button>

              {(filterTanggal || filterDeptId || searchQuery) && (
                <a
                  href={buildUrl({ menu: activeMenu })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </a>
              )}
            </form>

            {/* 1. DASHBOARD UTAMA */}
            {activeMenu === "dashboard" && (
              <div className="space-y-5">
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-xl border border-slate-200/80 border-t-4 border-t-blue-600 bg-white p-4 shadow-2xs">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      Total Karyawan
                    </p>
                    <p className="mt-1.5 text-2xl font-bold text-slate-900">
                      {employees.length}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 border-t-4 border-t-emerald-500 bg-white p-4 shadow-2xs">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      Hadir Hari Ini
                    </p>
                    <p className="mt-1.5 text-2xl font-bold text-emerald-700">
                      {hadirHariIniCount}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 border-t-4 border-t-amber-500 bg-white p-4 shadow-2xs">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      Terlambat
                    </p>
                    <p className="mt-1.5 text-2xl font-bold text-amber-700">
                      {terlambatHariIniCount}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 border-t-4 border-t-rose-500 bg-white p-4 shadow-2xs">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      Tidak Hadir
                    </p>
                    <p className="mt-1.5 text-2xl font-bold text-rose-700">
                      {tidakHadirHariIniCount}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 border-t-4 border-t-purple-500 bg-white p-4 shadow-2xs">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      Izin / Cuti
                    </p>
                    <p className="mt-1.5 text-2xl font-bold text-purple-700">
                      {izinCutiHariIniCount}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 border-t-4 border-t-cyan-500 bg-white p-4 shadow-2xs">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      Sedang Bekerja
                    </p>
                    <p className="mt-1.5 text-2xl font-bold text-cyan-700">
                      {sedangBekerjaCount}
                    </p>
                  </div>
                </section>

                <AttendanceCharts
                  weeklyData={weeklyData}
                  monthlyData={monthlyData}
                  lateData={lateData}
                />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                    <h2 className="text-sm font-bold text-slate-900">
                      Belum Check-in Hari Ini ({belumCheckInEmployees.length})
                    </h2>
                    {belumCheckInEmployees.length === 0 ? (
                      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                        Seluruh karyawan terdaftar sudah melakukan check-in atau
                        belum ada data karyawan.
                      </p>
                    ) : (
                      <ul className="mt-3 divide-y divide-slate-100 text-xs">
                        {belumCheckInEmployees.slice(0, 6).map((emp) => (
                          <li
                            key={emp.id}
                            className="flex items-center justify-between py-2"
                          >
                            <div>
                              <p className="font-semibold text-slate-800">
                                {emp.full_name}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {emp.employee_code} •{" "}
                                {emp.department_id
                                  ? deptMap.get(emp.department_id)?.name ?? "-"
                                  : "-"}
                              </p>
                            </div>
                            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                              Belum Masuk
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                    <h2 className="text-sm font-bold text-slate-900">
                      Aktivitas Terbaru
                    </h2>
                    {logs.length === 0 ? (
                      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                        Belum ada log aktivitas tercatat.
                      </p>
                    ) : (
                      <ul className="mt-3 divide-y divide-slate-100 text-xs">
                        {logs.slice(0, 6).map((log) => (
                          <li
                            key={log.id}
                            className="flex items-center justify-between gap-2 py-2"
                          >
                            <div>
                              <p className="font-mono text-[11px] font-semibold text-blue-700">
                                {log.action}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {log.entity_type}
                                {log.entity_id ? ` • ${log.entity_id}` : ""}
                              </p>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {formatDateTimeWita(log.created_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </div>
            )}

            {/* Tabel Absensi Terbaru / Riwayat (Dashboard & Absensi) */}
            {(activeMenu === "dashboard" || activeMenu === "absensi") && (
              <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      {activeMenu === "absensi"
                        ? "Check-in / Check-out & Riwayat Absensi"
                        : "Absensi Terbaru"}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Menampilkan {paginatedAttendance.length} dari{" "}
                      {filteredAttendance.length} data (Halaman {safePage} /{" "}
                      {totalPages})
                    </p>
                  </div>
                </div>

                {activeMenu === "absensi" && (
                  <AttendanceActionPanel
                    isStaffOperator={canManageMaster}
                    employees={employeeOptions}
                    activeWorkLocationName={activeLocation?.name}
                    activeRadiusMeters={activeLocation?.radius_meters}
                    checkInAction={checkInAction}
                    checkOutAction={checkOutAction}
                  />
                )}

                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full border-collapse text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                        <th className="px-3.5 py-2.5">Tanggal</th>
                        <th className="px-3.5 py-2.5">Karyawan</th>
                        <th className="px-3.5 py-2.5">Masuk</th>
                        <th className="px-3.5 py-2.5">Pulang</th>
                        <th className="px-3.5 py-2.5">Status</th>
                        <th className="px-3.5 py-2.5">GPS & Radius</th>
                        <th className="px-3.5 py-2.5">Foto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedAttendance.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-6 text-center text-xs text-slate-500"
                          >
                            Tidak ada data absensi sesuai filter yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        paginatedAttendance.map((row) => {
                          const emp = empMap.get(row.employee_id);
                          const hasCoords =
                            typeof row.check_in_lat === "number" &&
                            typeof row.check_in_lng === "number";
                          return (
                            <tr key={row.id} className="hover:bg-slate-50/70">
                              <td className="px-3.5 py-2.5 font-mono text-xs text-slate-700">
                                {row.attendance_date}
                              </td>
                              <td className="px-3.5 py-2.5 font-medium text-slate-900">
                                <div>{emp?.full_name || "Karyawan"}</div>
                                <div className="text-[11px] text-slate-500">
                                  {emp?.employee_code || "-"}
                                </div>
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-emerald-700">
                                {formatTimeWita(row.check_in_at)}
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-slate-700">
                                {formatTimeWita(row.check_out_at)}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                    row.status === "terlambat"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-emerald-50 text-emerald-700"
                                  }`}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">
                                {hasCoords ? (
                                  <a
                                    href={`https://www.google.com/maps?q=${row.check_in_lat},${row.check_in_lng}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 underline"
                                  >
                                    {row.check_in_lat!.toFixed(4)},{" "}
                                    {row.check_in_lng!.toFixed(4)}
                                  </a>
                                ) : (
                                  "-"
                                )}
                                {row.distance_meters !== null && (
                                  <div className="text-[10px] text-slate-400">
                                    {row.distance_meters}m (
                                    {row.within_radius
                                      ? "Dalam radius"
                                      : "Luar radius"}
                                    )
                                  </div>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  {row.check_in_photo && (
                                    <img
                                      src={row.check_in_photo}
                                      alt="Selfie Masuk"
                                      className="h-8 w-8 rounded border border-slate-200 object-cover"
                                    />
                                  )}
                                  {row.check_out_photo && (
                                    <img
                                      src={row.check_out_photo}
                                      alt="Selfie Pulang"
                                      className="h-8 w-8 rounded border border-slate-200 object-cover"
                                    />
                                  )}
                                  {!row.check_in_photo &&
                                    !row.check_out_photo && (
                                      <span className="text-xs text-slate-400">
                                        -
                                      </span>
                                    )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-slate-500">
                      Halaman {safePage} dari {totalPages}
                    </span>
                    <div className="flex gap-2">
                      {safePage > 1 && (
                        <a
                          href={buildUrl({
                            menu: activeMenu,
                            tanggal: filterTanggal || undefined,
                            departemenId: filterDeptId || undefined,
                            q: searchQuery || undefined,
                            page: safePage - 1,
                          })}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Sebelumnya
                        </a>
                      )}
                      {safePage < totalPages && (
                        <a
                          href={buildUrl({
                            menu: activeMenu,
                            tanggal: filterTanggal || undefined,
                            departemenId: filterDeptId || undefined,
                            q: searchQuery || undefined,
                            page: safePage + 1,
                          })}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Berikutnya
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 2. DATA KARYAWAN, DEPARTEMEN & JABATAN */}
            {activeMenu === "karyawan" && (
              <div className="space-y-5">
                {canManageMaster && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <form
                      action={addDepartmentAction}
                      className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3"
                    >
                      <h2 className="text-sm font-bold text-slate-900">
                        Tambah Departemen
                      </h2>
                      <input
                        type="text"
                        name="dept_name"
                        required
                        placeholder="Nama Departemen (mis. Operasional)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <input
                        type="text"
                        name="dept_desc"
                        placeholder="Keterangan (opsional)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Simpan Departemen
                      </button>
                    </form>

                    <form
                      action={addPositionAction}
                      className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3"
                    >
                      <h2 className="text-sm font-bold text-slate-900">
                        Tambah Jabatan
                      </h2>
                      <input
                        type="text"
                        name="pos_title"
                        required
                        placeholder="Nama Jabatan (mis. Staff HRD)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <select
                        name="pos_dept_id"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm"
                      >
                        <option value="">Pilih Departemen</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Simpan Jabatan
                      </button>
                    </form>
                  </div>
                )}

                {canManageMaster && (
                  <form
                    action={addEmployeeAction}
                    className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4"
                  >
                    <h2 className="text-sm font-bold text-slate-900">
                      Tambah Karyawan Baru
                    </h2>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                      <input
                        type="text"
                        name="employee_code"
                        required
                        placeholder="ID Karyawan (mis. LAJ-001)"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <input
                        type="text"
                        name="full_name"
                        required
                        placeholder="Nama Lengkap"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="Email Karyawan"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <input
                        type="text"
                        name="phone"
                        placeholder="Nomor Telepon"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <select
                        name="department_id"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm"
                      >
                        <option value="">Departemen</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <select
                        name="position_id"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm"
                      >
                        <option value="">Jabatan</option>
                        {positions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        name="join_date"
                        defaultValue={todayWita}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <input
                        type="text"
                        name="user_id"
                        placeholder="Auth User UUID (opsional)"
                        className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs sm:text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Simpan Data Karyawan
                    </button>
                  </form>
                )}

                <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                  <h2 className="text-sm font-bold text-slate-900">
                    Daftar Karyawan ({employees.length})
                  </h2>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full border-collapse text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50">
                        <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                          <th className="px-3.5 py-2.5">ID</th>
                          <th className="px-3.5 py-2.5">Nama Lengkap</th>
                          <th className="px-3.5 py-2.5">Email & Telepon</th>
                          <th className="px-3.5 py-2.5">Departemen & Jabatan</th>
                          <th className="px-3.5 py-2.5">Bergabung</th>
                          <th className="px-3.5 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {employees.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/70">
                            <td className="px-3.5 py-2.5 font-mono text-xs">
                              {emp.employee_code}
                            </td>
                            <td className="px-3.5 py-2.5 font-medium text-slate-900">
                              {emp.full_name}
                            </td>
                            <td className="px-3.5 py-2.5 text-xs text-slate-600">
                              <div>{emp.email}</div>
                              <div className="text-slate-400">
                                {emp.phone || "-"}
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 text-xs text-slate-700">
                              <div>
                                {emp.department_id
                                  ? deptMap.get(emp.department_id)?.name ?? "-"
                                  : "-"}
                              </div>
                              <div className="text-slate-500">
                                {emp.position_id
                                  ? posMap.get(emp.position_id)?.title ?? "-"
                                  : "-"}
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">
                              {emp.join_date}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-blue-700">
                                {emp.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* 3. LOKASI & GPS */}
            {activeMenu === "lokasi" && (
              <div className="space-y-5">
                {canManageMaster && (
                  <form
                    action={saveWorkLocationAction}
                    className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4"
                  >
                    <h2 className="text-sm font-bold text-slate-900">
                      Tambah Lokasi Kantor & Radius Geofencing
                    </h2>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                      <input
                        type="text"
                        name="loc_name"
                        required
                        placeholder="Nama Lokasi Kantor"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <input
                        type="number"
                        step="any"
                        name="loc_lat"
                        required
                        placeholder="Latitude (mis. -5.147665)"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <input
                        type="number"
                        step="any"
                        name="loc_lng"
                        required
                        placeholder="Longitude (mis. 119.432732)"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <input
                        type="number"
                        name="loc_radius"
                        defaultValue={150}
                        placeholder="Radius (meter)"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                    </div>
                    <input
                      type="text"
                      name="loc_address"
                      placeholder="Alamat kantor (opsional)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Simpan Lokasi Kantor
                    </button>
                  </form>
                )}

                <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
                  <h2 className="text-sm font-bold text-slate-900">
                    Daftar Lokasi Kantor ({locations.length})
                  </h2>
                  {locations.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 p-3.5 text-xs text-slate-500">
                      Belum ada lokasi kantor yang dikonfigurasi.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {locations.map((loc) => (
                        <div
                          key={loc.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-slate-900">
                              {loc.name}
                            </p>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              Radius {loc.radius_meters}m
                            </span>
                          </div>
                          <p className="mt-1 text-slate-500">
                            {loc.address || "-"}
                          </p>
                          <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-slate-600">
                            <span>
                              {loc.latitude}, {loc.longitude}
                            </span>
                            <a
                              href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-sans font-semibold text-blue-600 underline"
                            >
                              Buka Peta
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* 4. VERIFIKASI WAJAH & FOTO SELFIE */}
            {activeMenu === "wajah" && (
              <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Verifikasi Foto Selfie Kehadiran
                  </h2>
                  <p className="text-xs text-slate-500">
                    Foto yang diambil saat check-in dan check-out tersimpan pada
                    rekam kehadiran Supabase.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredAttendance
                    .filter((r) => r.check_in_photo || r.check_out_photo)
                    .map((r) => {
                      const emp = empMap.get(r.employee_id);
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-slate-900">
                                {emp?.full_name || "Karyawan"}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {r.attendance_date} • {r.status}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-slate-200 bg-white p-1.5 text-center">
                              <p className="mb-1 text-[10px] text-slate-500">
                                Masuk
                              </p>
                              {r.check_in_photo ? (
                                <img
                                  src={r.check_in_photo}
                                  alt="Foto Masuk"
                                  className="h-24 w-full rounded object-cover"
                                />
                              ) : (
                                <div className="flex h-24 items-center justify-center text-[11px] text-slate-400">
                                  -
                                </div>
                              )}
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-1.5 text-center">
                              <p className="mb-1 text-[10px] text-slate-500">
                                Pulang
                              </p>
                              {r.check_out_photo ? (
                                <img
                                  src={r.check_out_photo}
                                  alt="Foto Pulang"
                                  className="h-24 w-full rounded object-cover"
                                />
                              ) : (
                                <div className="flex h-24 items-center justify-center text-[11px] text-slate-400">
                                  -
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </section>
            )}

            {/* 5. JADWAL & SHIFT */}
            {activeMenu === "jadwal" && (
              <div className="space-y-5">
                {canManageMaster && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <form
                      action={addWorkShiftAction}
                      className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3"
                    >
                      <h2 className="text-sm font-bold text-slate-900">
                        Pengaturan Shift Kerja
                      </h2>
                      <input
                        type="text"
                        name="shift_name"
                        required
                        placeholder="Nama Shift (mis. Shift Pagi)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <div className="grid grid-cols-3 gap-2.5">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Jam Mulai
                          </label>
                          <input
                            type="time"
                            name="start_time"
                            defaultValue={settings.default_work_start.slice(
                              0,
                              5
                            )}
                            required
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Jam Selesai
                          </label>
                          <input
                            type="time"
                            name="end_time"
                            defaultValue={settings.default_work_end.slice(0, 5)}
                            required
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Toleransi (mnt)
                          </label>
                          <input
                            type="number"
                            name="grace_minutes"
                            defaultValue={settings.default_grace_minutes}
                            min={0}
                            max={180}
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Simpan Shift
                      </button>
                    </form>

                    <form
                      action={assignScheduleAction}
                      className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3"
                    >
                      <h2 className="text-sm font-bold text-slate-900">
                        Tetapkan Jadwal Kerja Karyawan
                      </h2>
                      <select
                        name="schedule_employee_id"
                        required
                        defaultValue={employees[0]?.id ?? ""}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm"
                      >
                        <option value="">Pilih Karyawan</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.employee_code} — {e.full_name}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <select
                          name="schedule_shift_id"
                          required
                          defaultValue={shifts[0]?.id ?? ""}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                        >
                          <option value="">Pilih Shift</option>
                          {shifts.map((sh) => (
                            <option key={sh.id} value={sh.id}>
                              {sh.name} ({sh.start_time.slice(0, 5)} -{" "}
                              {sh.end_time.slice(0, 5)})
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          name="schedule_date"
                          defaultValue={todayWita}
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                        />
                      </div>
                      <input
                        type="text"
                        name="schedule_notes"
                        placeholder="Catatan jadwal / kalender kerja (opsional)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Simpan Jadwal
                      </button>
                    </form>
                  </div>
                )}

                <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Daftar Shift ({shifts.length}) & Jadwal Kerja (
                      {filteredSchedules.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Jadwal kerja harian/kalender karyawan tersinkronisasi
                      dengan Supabase.
                    </p>
                  </div>

                  {shifts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {shifts.map((sh) => (
                        <span
                          key={sh.id}
                          className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs text-blue-900"
                        >
                          <strong>{sh.name}</strong> •{" "}
                          {sh.start_time.slice(0, 5)}–{sh.end_time.slice(0, 5)}{" "}
                          (toleransi {sh.grace_minutes} mnt)
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full border-collapse text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50">
                        <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                          <th className="px-3.5 py-2.5">Tanggal</th>
                          <th className="px-3.5 py-2.5">Karyawan</th>
                          <th className="px-3.5 py-2.5">Shift</th>
                          <th className="px-3.5 py-2.5">Jam Kerja</th>
                          <th className="px-3.5 py-2.5">Catatan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredSchedules.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-4 py-6 text-center text-xs text-slate-500"
                            >
                              Belum ada jadwal kerja yang sesuai filter.
                            </td>
                          </tr>
                        ) : (
                          filteredSchedules.map((sc) => {
                            const emp = empMap.get(sc.employee_id);
                            const sh = shiftMap.get(sc.shift_id);
                            return (
                              <tr key={sc.id} className="hover:bg-slate-50/70">
                                <td className="px-3.5 py-2.5 font-mono text-xs text-slate-700">
                                  {sc.schedule_date}
                                </td>
                                <td className="px-3.5 py-2.5 font-medium text-slate-900">
                                  {emp?.full_name || "Karyawan"} (
                                  {emp?.employee_code || "-"})
                                </td>
                                <td className="px-3.5 py-2.5 text-xs font-semibold text-blue-700">
                                  {sh?.name || "-"}
                                </td>
                                <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">
                                  {sh
                                    ? `${sh.start_time.slice(0, 5)} - ${sh.end_time.slice(0, 5)}`
                                    : "-"}
                                </td>
                                <td className="px-3.5 py-2.5 text-xs text-slate-600">
                                  {sc.notes || "-"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* 6. LEMBUR */}
            {activeMenu === "lembur" && (
              <div className="space-y-5">
                <form
                  action={createOvertimeAction}
                  className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4"
                >
                  <h2 className="text-sm font-bold text-slate-900">
                    Ajukan Lembur Baru
                  </h2>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    {canManageMaster ? (
                      <select
                        name="ot_employee_id"
                        required
                        defaultValue={employees[0]?.id ?? ""}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm"
                      >
                        <option value="">Pilih Karyawan</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.employee_code} — {e.full_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                        {ownEmployee
                          ? `${ownEmployee.employee_code} — ${ownEmployee.full_name}`
                          : "Akun belum tertaut karyawan"}
                      </div>
                    )}
                    <input
                      type="date"
                      name="ot_date"
                      defaultValue={todayWita}
                      required
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                    />
                    <input
                      type="time"
                      name="ot_start"
                      defaultValue="17:00"
                      required
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                    />
                    <input
                      type="time"
                      name="ot_end"
                      defaultValue="19:00"
                      required
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    name="ot_reason"
                    required
                    placeholder="Uraian pekerjaan / alasan lembur"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Kirim Pengajuan Lembur
                  </button>
                </form>

                <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
                  <h2 className="text-sm font-bold text-slate-900">
                    Daftar Pengajuan Lembur ({overtimeList.length})
                  </h2>
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full border-collapse text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50">
                        <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                          <th className="px-3.5 py-2.5">Tanggal</th>
                          <th className="px-3.5 py-2.5">Karyawan</th>
                          <th className="px-3.5 py-2.5">Jam & Durasi</th>
                          <th className="px-3.5 py-2.5">Alasan</th>
                          <th className="px-3.5 py-2.5">Status</th>
                          {canManageMaster && (
                            <th className="px-3.5 py-2.5">Aksi</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {overtimeList.length === 0 ? (
                          <tr>
                            <td
                              colSpan={canManageMaster ? 6 : 5}
                              className="px-4 py-6 text-center text-xs text-slate-500"
                            >
                              Belum ada pengajuan lembur.
                            </td>
                          </tr>
                        ) : (
                          overtimeList.map((ot) => {
                            const emp = empMap.get(ot.employee_id);
                            return (
                              <tr key={ot.id} className="hover:bg-slate-50/70">
                                <td className="px-3.5 py-2.5 font-mono text-xs">
                                  {ot.overtime_date}
                                </td>
                                <td className="px-3.5 py-2.5 font-medium text-slate-900">
                                  {emp?.full_name || "Karyawan"}
                                </td>
                                <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">
                                  {ot.start_time.slice(0, 5)} -{" "}
                                  {ot.end_time.slice(0, 5)} ({ot.hours_worked}{" "}
                                  jam)
                                </td>
                                <td className="px-3.5 py-2.5 text-xs text-slate-700">
                                  {ot.reason}
                                </td>
                                <td className="px-3.5 py-2.5">
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                                      ot.status === "approved"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : ot.status === "rejected"
                                        ? "bg-rose-50 text-rose-700"
                                        : "bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {ot.status}
                                  </span>
                                </td>
                                {canManageMaster && (
                                  <td className="px-3.5 py-2.5">
                                    {ot.status === "pending" ? (
                                      <div className="flex gap-1.5">
                                        <form action={reviewOvertimeAction}>
                                          <input
                                            type="hidden"
                                            name="overtime_id"
                                            value={ot.id}
                                          />
                                          <input
                                            type="hidden"
                                            name="decision"
                                            value="approved"
                                          />
                                          <button
                                            type="submit"
                                            className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                          >
                                            Setujui
                                          </button>
                                        </form>
                                        <form action={reviewOvertimeAction}>
                                          <input
                                            type="hidden"
                                            name="overtime_id"
                                            value={ot.id}
                                          />
                                          <input
                                            type="hidden"
                                            name="decision"
                                            value="rejected"
                                          />
                                          <button
                                            type="submit"
                                            className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                                          >
                                            Tolak
                                          </button>
                                        </form>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400">
                                        Selesai
                                      </span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* 7. CUTI & IZIN */}
            {activeMenu === "cuti" && (
              <div className="space-y-5">
                <form
                  action={createLeaveAction}
                  className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4"
                >
                  <h2 className="text-sm font-bold text-slate-900">
                    Ajukan Cuti / Izin / Sakit
                  </h2>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    {canManageMaster ? (
                      <select
                        name="leave_employee_id"
                        required
                        defaultValue={employees[0]?.id ?? ""}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm"
                      >
                        <option value="">Pilih Karyawan</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.employee_code} — {e.full_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                        {ownEmployee
                          ? `${ownEmployee.employee_code} — ${ownEmployee.full_name}`
                          : "Akun belum tertaut karyawan"}
                      </div>
                    )}
                    <select
                      name="leave_type"
                      defaultValue="izin"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm"
                    >
                      <option value="izin">Izin</option>
                      <option value="cuti">Cuti</option>
                      <option value="sakit">Sakit</option>
                    </select>
                    <input
                      type="date"
                      name="leave_start"
                      defaultValue={todayWita}
                      required
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                    />
                    <input
                      type="date"
                      name="leave_end"
                      defaultValue={todayWita}
                      required
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    name="leave_reason"
                    required
                    placeholder="Alasan / keterangan cuti atau izin"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Kirim Pengajuan Cuti/Izin
                  </button>
                </form>

                <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
                  <h2 className="text-sm font-bold text-slate-900">
                    Riwayat Cuti & Izin ({leaveList.length})
                  </h2>
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full border-collapse text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50">
                        <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                          <th className="px-3.5 py-2.5">Karyawan</th>
                          <th className="px-3.5 py-2.5">Jenis</th>
                          <th className="px-3.5 py-2.5">Periode</th>
                          <th className="px-3.5 py-2.5">Alasan</th>
                          <th className="px-3.5 py-2.5">Status</th>
                          {canManageMaster && (
                            <th className="px-3.5 py-2.5">Aksi</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {leaveList.length === 0 ? (
                          <tr>
                            <td
                              colSpan={canManageMaster ? 6 : 5}
                              className="px-4 py-6 text-center text-xs text-slate-500"
                            >
                              Belum ada pengajuan cuti atau izin.
                            </td>
                          </tr>
                        ) : (
                          leaveList.map((lv) => {
                            const emp = empMap.get(lv.employee_id);
                            return (
                              <tr key={lv.id} className="hover:bg-slate-50/70">
                                <td className="px-3.5 py-2.5 font-medium text-slate-900">
                                  {emp?.full_name || "Karyawan"}
                                </td>
                                <td className="px-3.5 py-2.5 text-xs font-semibold uppercase text-purple-700">
                                  {lv.leave_type}
                                </td>
                                <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">
                                  {lv.start_date} s/d {lv.end_date}
                                </td>
                                <td className="px-3.5 py-2.5 text-xs text-slate-700">
                                  {lv.reason}
                                </td>
                                <td className="px-3.5 py-2.5">
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                                      lv.status === "approved"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : lv.status === "rejected"
                                        ? "bg-rose-50 text-rose-700"
                                        : "bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {lv.status}
                                  </span>
                                </td>
                                {canManageMaster && (
                                  <td className="px-3.5 py-2.5">
                                    {lv.status === "pending" ? (
                                      <div className="flex gap-1.5">
                                        <form action={reviewLeaveAction}>
                                          <input
                                            type="hidden"
                                            name="leave_id"
                                            value={lv.id}
                                          />
                                          <input
                                            type="hidden"
                                            name="decision"
                                            value="approved"
                                          />
                                          <button
                                            type="submit"
                                            className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                          >
                                            Setujui
                                          </button>
                                        </form>
                                        <form action={reviewLeaveAction}>
                                          <input
                                            type="hidden"
                                            name="leave_id"
                                            value={lv.id}
                                          />
                                          <input
                                            type="hidden"
                                            name="decision"
                                            value="rejected"
                                          />
                                          <button
                                            type="submit"
                                            className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                                          >
                                            Tolak
                                          </button>
                                        </form>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400">
                                        Selesai
                                      </span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* 8. TIMESHEET REKAP KARYAWAN */}
            {activeMenu === "timesheet" && (
              <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Timesheet Kehadiran, Jadwal & Lembur Karyawan
                  </h2>
                  <p className="text-xs text-slate-500">
                    Ringkasan aktual dari data absensi, jadwal shift, lembur
                    disetujui, dan cuti/izin per karyawan.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full border-collapse text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                        <th className="px-3.5 py-2.5">Karyawan</th>
                        <th className="px-3.5 py-2.5">Departemen</th>
                        <th className="px-3.5 py-2.5">Hari Hadir</th>
                        <th className="px-3.5 py-2.5">Terlambat</th>
                        <th className="px-3.5 py-2.5">Jadwal Shift</th>
                        <th className="px-3.5 py-2.5">Lembur Disetujui</th>
                        <th className="px-3.5 py-2.5">Cuti/Izin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {employees
                        .filter((e) =>
                          filterDeptId ? e.department_id === filterDeptId : true
                        )
                        .map((emp) => {
                          const empAtt = attendanceList.filter(
                            (a) => a.employee_id === emp.id
                          );
                          const hadirCount = empAtt.filter((a) =>
                            ["hadir", "terlambat"].includes(
                              a.status.toLowerCase()
                            )
                          ).length;
                          const lateCount = empAtt.filter(
                            (a) => a.status.toLowerCase() === "terlambat"
                          ).length;
                          const schedCount = schedules.filter(
                            (s) => s.employee_id === emp.id
                          ).length;
                          const otHours = overtimeList
                            .filter(
                              (o) =>
                                o.employee_id === emp.id &&
                                o.status === "approved"
                            )
                            .reduce(
                              (acc, cur) => acc + Number(cur.hours_worked || 0),
                              0
                            );
                          const leaveCount = leaveList.filter(
                            (l) => l.employee_id === emp.id
                          ).length;

                          return (
                            <tr key={emp.id} className="hover:bg-slate-50/70">
                              <td className="px-3.5 py-2.5 font-medium text-slate-900">
                                {emp.full_name}{" "}
                                <span className="font-mono text-xs text-slate-400">
                                  ({emp.employee_code})
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 text-xs text-slate-600">
                                {emp.department_id
                                  ? deptMap.get(emp.department_id)?.name ?? "-"
                                  : "-"}
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-emerald-700">
                                {hadirCount} hari
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-amber-700">
                                {lateCount}x
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-blue-700">
                                {schedCount} jadwal
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-slate-700">
                                {otHours} jam
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-purple-700">
                                {leaveCount} pengajuan
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 9. LAPORAN */}
            {activeMenu === "laporan" && (
              <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Laporan Kehadiran & Rekap Keterlambatan
                    </h2>
                    <p className="text-xs text-slate-500">
                      Unduh rekap data terfilter dalam format CSV (dapat dibuka di
                      Microsoft Excel).
                    </p>
                  </div>
                  <a
                    href={csvHref}
                    download={`laporan-absensi-${filterTanggal || todayWita}.csv`}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Unduh Laporan (.CSV)
                  </a>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                  <div className="rounded-xl bg-slate-50 p-3.5">
                    <p className="text-slate-500">Total Baris Terfilter</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {filteredAttendance.length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3.5">
                    <p className="text-slate-500">Jumlah Terlambat (Terfilter)</p>
                    <p className="mt-1 text-lg font-bold text-amber-700">
                      {
                        filteredAttendance.filter(
                          (r) => r.status.toLowerCase() === "terlambat"
                        ).length
                      }
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3.5">
                    <p className="text-slate-500">Jumlah Sudah Check-out</p>
                    <p className="mt-1 text-lg font-bold text-blue-700">
                      {
                        filteredAttendance.filter((r) => Boolean(r.check_out_at))
                          .length
                      }
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* 10. NOTIFIKASI */}
            {activeMenu === "notifikasi" && (
              <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Pusat Notifikasi ({unreadNotifCount} belum dibaca)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Notifikasi otomatis dari pengajuan dan persetujuan lembur
                      maupun cuti/izin.
                    </p>
                  </div>
                  {unreadNotifCount > 0 && (
                    <form action={markAllNotificationsReadAction}>
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Tandai Semua Dibaca
                      </button>
                    </form>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
                    Belum ada notifikasi tercatat.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white">
                    {notifications.map((n) => (
                      <li
                        key={n.id}
                        className={`flex items-start justify-between gap-3 p-3.5 text-xs ${
                          n.is_read ? "bg-white" : "bg-blue-50/40"
                        }`}
                      >
                        <div>
                          <p className="font-bold text-slate-900">{n.title}</p>
                          <p className="mt-0.5 text-slate-600">{n.message}</p>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatDateTimeWita(n.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* 11. LOG AKTIVITAS */}
            {activeMenu === "log" && (
              <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
                <h2 className="text-sm font-bold text-slate-900">
                  Log Aktivitas Sistem ({logs.length})
                </h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                        <th className="px-3.5 py-2.5">Waktu (WITA)</th>
                        <th className="px-3.5 py-2.5">Aksi</th>
                        <th className="px-3.5 py-2.5">Entitas</th>
                        <th className="px-3.5 py-2.5">Referensi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {logs.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3.5 py-2 font-mono text-slate-600">
                            {formatDateTimeWita(l.created_at)}
                          </td>
                          <td className="px-3.5 py-2 font-mono font-semibold text-blue-700">
                            {l.action}
                          </td>
                          <td className="px-3.5 py-2 text-slate-700">
                            {l.entity_type}
                          </td>
                          <td className="px-3.5 py-2 font-mono text-slate-500">
                            {l.entity_id || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 12. PENGATURAN APLIKASI */}
            {activeMenu === "pengaturan" && (
              <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Pengaturan Sistem {settings.company_name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Konfigurasi jam kerja standar, toleransi keterlambatan, dan
                    kebijakan validasi kehadiran.
                  </p>
                </div>

                {canManageMaster ? (
                  <form action={saveAppSettingsAction} className="space-y-4">
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Nama Aplikasi / Perusahaan
                        </label>
                        <input
                          type="text"
                          name="company_name"
                          defaultValue={settings.company_name}
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Zona Waktu
                        </label>
                        <input
                          type="text"
                          name="timezone"
                          defaultValue={settings.timezone}
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Toleransi Keterlambatan (Menit)
                        </label>
                        <input
                          type="number"
                          name="default_grace_minutes"
                          defaultValue={settings.default_grace_minutes}
                          min={0}
                          max={180}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Jam Masuk Standar
                        </label>
                        <input
                          type="time"
                          name="default_work_start"
                          defaultValue={settings.default_work_start.slice(0, 5)}
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Jam Pulang Standar
                        </label>
                        <input
                          type="time"
                          name="default_work_end"
                          defaultValue={settings.default_work_end.slice(0, 5)}
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-5 text-xs text-slate-700">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="require_selfie"
                          defaultChecked={settings.require_selfie}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>Aktifkan Foto Selfie Kehadiran</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="require_gps"
                          defaultChecked={settings.require_gps}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>Aktifkan Lokasi & Geofencing GPS</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Simpan Pengaturan
                    </button>
                  </form>
                ) : (
                  <p className="rounded-lg bg-slate-50 p-3.5 text-xs text-slate-600">
                    Zona waktu aktif: <strong>{settings.timezone}</strong> • Jam
                    kerja:{" "}
                    <strong>
                      {settings.default_work_start.slice(0, 5)} -{" "}
                      {settings.default_work_end.slice(0, 5)}
                    </strong>{" "}
                    (toleransi {settings.default_grace_minutes} menit).
                  </p>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}