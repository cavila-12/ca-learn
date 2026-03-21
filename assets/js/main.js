import { syncThemeColorMeta } from "./core/theme.js";
import { setOnlineStatusTag, registerServiceWorker, wireInstallPrompt } from "./core/pwa.js";
import { wireDrawerUI } from "./ui/drawer.js";
import { loadDefaultDecksIfNeeded } from "./core/defaults.js";
import { page } from "./core/page.js";
import { initDecksPage } from "./pages/decks.js";
import { initQuizPage } from "./pages/quiz.js";
import { initModulesPage } from "./pages/modules.js";
import { initSettingsPage } from "./pages/settings.js";

async function main() {
  syncThemeColorMeta();
  setOnlineStatusTag();
  wireInstallPrompt();
  wireDrawerUI();
  await registerServiceWorker();
  await loadDefaultDecksIfNeeded();

  if (page() === "decks") initDecksPage();
  if (page() === "quiz") initQuizPage();
  if (page() === "modules") initModulesPage();
  if (page() === "settings") initSettingsPage();
}

main();


