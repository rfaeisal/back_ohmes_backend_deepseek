// =============================================================================
// Admin Gate — permission penanda role "admin-ish" yang boleh masuk /admin
// =============================================================================
// Operator lantai (OPERATOR_KECER / OPERATOR_MEMBER) TIDAK punya satupun dari
// daftar ini — mereka cuma pegang shift.* + dashboard.plant.view (KPI tablet).
// Dipakai di: landing /tablet (sembunyikan shortcut Admin Dashboard) dan
// layout /admin (redirect operator yang ketik URL manual ke /tablet).
// =============================================================================

export const ADMIN_GATE_PERMISSIONS = [
  "shift.approve", // SHIFT_SUPERVISOR → approval
  "shift.correct", // admin → correction
  "audit.read", // supervisor + admin
  "dashboard.area.view", // AREA_COORDINATOR / AREA_QA
  "dashboard.hq.view", // HQ roles
  "tsg.receiving.view", // GUDANG_INBOUND + PLANT_MANAGER
  "supplier.sj.view", // AREA_SJ_OFFICER + PLANT_MANAGER
  "cartoning.view", // GUDANG_OUTBOUND
  "dispatch.order.view", // EKSPEDISI
  "report.export_operational", // HQ analyst
  "user.assign_scope", // admin users
  "masterdata.shift-template.edit", // PLANT_MANAGER + SUPERADMIN
] as const;

export function canAccessAdmin(
  permissions: string[],
  isPrivileged: boolean
): boolean {
  if (isPrivileged) return true;
  return ADMIN_GATE_PERMISSIONS.some((p) => permissions.includes(p));
}
