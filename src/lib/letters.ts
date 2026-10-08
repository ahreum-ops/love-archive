import { today } from "./dates";
import type { Letter } from "./types";

/** 열어볼 날이 아직 안 됐으면 잠김 (받는 사람만 못 엶) */
export function isLocked(l: Letter) {
  return !!l.openAt && l.openAt > today();
}
