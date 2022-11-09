// @ts-expect-error typescript doesnt like opening package.json
import { version } from "../../../package.json";

export function getVersion(): string {
  return version;
}
