import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const source = path.dirname(require.resolve("discord.js"));
const packageRoot = path.dirname(source);
const baselineRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nypsi-discord-cache-"));
fs.cpSync(source, path.join(baselineRoot, "src"), { recursive: true });
fs.copyFileSync(path.join(packageRoot, "package.json"), path.join(baselineRoot, "package.json"));
fs.symlinkSync(path.dirname(packageRoot), path.join(baselineRoot, "node_modules"), "dir");
execFileSync(
  "git",
  [
    "apply",
    "--reverse",
    fileURLToPath(new URL("../../patches/discord.js@14.27.0.patch", import.meta.url)),
  ],
  {
    cwd: baselineRoot,
  },
);

export const patched = require("discord.js");
export const baseline = require(baselineRoot);
const frozenPermissionsPath = path.join(source, "util/getFrozenPermissions.js");
export const getFrozenPermissions = require(frozenPermissionsPath);
export const channelUpdate = require(path.join(source, "client/websocket/handlers/CHANNEL_UPDATE"));

export function freshPermissionsPool() {
  delete require.cache[frozenPermissionsPath];
  return require(frozenPermissionsPath);
}
