import { test as base } from "@playwright/test";
import { loginAs } from "./helpers/auth";

// Fixture `login` — auto-accept semua dialog browser (alert/confirm dipakai
// di approval, tutup karton, dispatch) + login API + inject token.
// Semua spec import `test`/`expect` dari sini, bukan dari @playwright/test.
export const test = base.extend<{
  login: (username: string) => Promise<void>;
}>({
  login: async ({ context, page }, use) => {
    context.on("dialog", (d) => void d.accept());
    await use((username) => loginAs(context, page, username));
  },
});

export { expect } from "@playwright/test";
