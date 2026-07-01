import { copyFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const docsDir = path.join(repoRoot, "docs");
const docsIconsDir = path.join(docsDir, "icons");
const shouldSyncIcons = process.argv.includes("--with-icons");

mkdirSync(docsDir, { recursive: true });

copyFileSync(path.join(repoRoot, "contentStyle.css"), path.join(docsDir, "contentStyle.css"));

if (shouldSyncIcons) {
  mkdirSync(docsIconsDir, { recursive: true });

  for (const iconName of ["icon16.png", "icon48.png", "icon128.png"]) {
    const sourcePath = path.join(repoRoot, "icons", iconName);
    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, path.join(docsIconsDir, iconName));
    }
  }
}

const iconMessage = shouldSyncIcons ? " CSS and icons" : " CSS";
console.log(`Synced preview${iconMessage} to docs/.`);
