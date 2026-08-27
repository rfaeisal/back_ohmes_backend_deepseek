// global-teardown.ts — bersihkan efek samping `next build` dengan
// NEXT_DIST_DIR=.next-e2e: Next menulis ulang next-env.d.ts & tsconfig.json
// agar menunjuk .next-e2e/types. Kembalikan ke versi git setelah suite selesai
// (hanya kalau polusinya benar-benar ada — perubahan lokal user tidak disentuh).
import { execSync } from "node:child_process";

export default async function globalTeardown(): Promise<void> {
  for (const file of ["next-env.d.ts", "tsconfig.json"]) {
    try {
      const diff = execSync(`git diff -- ${file}`, { encoding: "utf8" });
      if (diff.includes(".next-e2e")) {
        execSync(`git checkout -- ${file}`);
        console.log(`[e2e-teardown] ${file} dikembalikan (auto-edit oleh next build)`);
      }
    } catch {
      // Bukan repo git / file tidak berubah — abaikan
    }
  }
}
