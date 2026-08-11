// =============================================================================
// Plant Onboarding Service — Setup pabrik baru
// =============================================================================

import { eq } from "drizzle-orm";
import db from "@/db";
import { plant, region } from "@/db/schema/tenancy";
import { machine, shiftTemplate } from "@/db/schema/master-product";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

export async function onboardPlant(input: {
  regionId: string;
  code: string;
  name: string;
  address?: string;
  machines: Array<{ code: string; name: string; type: "MAKER" | "HLP" }>;
  shiftTemplates: Array<{
    code: string; name: string; startTime: string; durationMinutes: number;
  }>;
}) {
  // Validasi region exists
  const [reg] = await db.select({ id: region.id }).from(region).where(eq(region.id, input.regionId)).limit(1);
  if (!reg) throw new ServiceError("REGION_NOT_FOUND", "Region tidak ditemukan.");

  // Validasi plant code unique
  const [existing] = await db.select({ id: plant.id }).from(plant).where(eq(plant.code, input.code)).limit(1);
  if (existing) throw new ServiceError("PLANT_CODE_EXISTS", `Kode pabrik ${input.code} sudah ada.`);

  const result = await db.transaction(async (tx) => {
    // Create plant
    const [plt] = await tx.insert(plant).values({
      regionId: input.regionId,
      code: input.code,
      name: input.name,
      address: input.address ?? null,
    }).returning();
    if (!plt) throw new Error("PLANT_CREATE_FAILED");

    // Create machines
    for (const m of input.machines) {
      await tx.insert(machine).values({
        plantId: plt.id, code: m.code, name: m.name, type: m.type,
      });
    }

    // Create shift templates
    for (const st of input.shiftTemplates) {
      await tx.insert(shiftTemplate).values({
        plantId: plt.id, code: st.code, name: st.name,
        startTime: st.startTime, durationMinutes: st.durationMinutes,
      });
    }

    return plt;
  });

  return {
    plantId: result.id,
    code: result.code,
    name: result.name,
    machinesCount: input.machines.length,
    shiftTemplatesCount: input.shiftTemplates.length,
  };
}
