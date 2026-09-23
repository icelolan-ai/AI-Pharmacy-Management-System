/** U-8 — ใครดูผังได้ ใครแก้ผังได้ และผังต้องไม่พูดถึงเงิน
 *
 *  Chat A set the rule: reading the map is open to every signed-in role,
 *  because a cashier has to find where a medicine sits; drawing it belongs to
 *  the owner alone, the same as the shop's own details.
 *
 *  D32/D33 still apply to what the map answers with. The map says where
 *  things are. What they cost stays behind the endpoints that already guard
 *  it — if a filter ever drags cost into this answer, this file fails.
 *
 *  Both halves are read from the files that actually decide: the ability
 *  table in the web app, and the role dependency on each backend route. A
 *  check that repeated the rule in its own words would only prove it agrees
 *  with itself (D43-a). Every element is matched whole and every match is
 *  asserted to have found something (D43-c).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createChecker, SRC, source } from "./lib.mjs";

const check = createChecker("U-8 — สิทธิ์ผังร้าน");

const abilities = source("lib/abilities.ts");
const BACKEND = join(SRC, "..", "..", "backend");
const router = readFileSync(join(BACKEND, "app", "routers", "store_map.py"), "utf8");
const schemas = readFileSync(join(BACKEND, "app", "schemas", "store_map.py"), "utf8");
const service = readFileSync(join(BACKEND, "app", "services", "store_map.py"), "utf8");

// --- 1. the ability table, read from the file that decides it -------------
function roleList(name) {
  const found = abilities.match(new RegExp(`const ${name}: readonly Role\\[\\] = \\[([^\\]]*)\\]`));
  return found
    ? found[1].split(",").map((part) => part.trim().replace(/"/g, "")).filter(Boolean)
    : null;
}

const GROUPS = { MANAGERS: roleList("MANAGERS"), OWNER_ONLY: roleList("OWNER_ONLY") };

function rolesFor(ability) {
  const found = abilities.match(new RegExp(`\\n  ${ability}: ([A-Z_]+),`));
  return found ? GROUPS[found[1]] : null;
}

check.eq("อ่านตารางสิทธิ์ได้จริง ไม่ใช่เดา", GROUPS.OWNER_ONLY, ["owner"]);
check.eq("แก้ผัง = owner เท่านั้น", rolesFor("manageStoreMap"), ["owner"]);
check.eq(
  "pharmacist แก้ผังไม่ได้",
  rolesFor("manageStoreMap").includes("pharmacist"),
  false,
);
check.eq("staff แก้ผังไม่ได้", rolesFor("manageStoreMap").includes("staff"), false);

// --- 2. the backend agrees, route by route --------------------------------
//
// Each decorator and the function under it are matched as one element. A
// pattern that stopped matching would leave this file green while asserting
// nothing, so the count is checked first.
const routes = [
  ...router.matchAll(/@router\.(get|put|post|patch|delete)\([^)]*\)\s*\ndef\s+\w+\(([^)]*)\):/g),
].map((match) => ({ method: match[1], params: match[2], whole: match[0] }));

check.ok("อ่าน route ของผังออกมาได้จริง", routes.length > 0, "nothing to assert against");
check.eq("มี endpoint ครบ 8 ตัว", routes.length, 8);

const readers = routes.filter((route) => route.method === "get");
const writers = routes.filter((route) => route.method !== "get");
check.eq("มี endpoint สำหรับอ่าน 1 ตัว", readers.length, 1);
check.eq("มี endpoint สำหรับแก้ 7 ตัว", writers.length, 7);

check.ok(
  "อ่านผังได้ทุก role ที่ล็อกอินแล้ว",
  readers.every((route) => /user: AnyRole/.test(route.params)),
  readers.map((r) => r.params).join(" | "),
);
check.eq(
  "ทุก endpoint ที่แก้ผัง บังคับ Owner",
  writers.filter((route) => !/user: Owner/.test(route.params)).map((route) => route.whole),
  [],
);
check.ok(
  // The names are only names until they are tied to a role list.
  "Owner ในไฟล์นี้คือ owner จริง ๆ",
  /Owner = Annotated\[CurrentUser, Depends\(require_roles\("owner"\)\)\]/.test(router),
);
check.ok(
  "AnyRole คือแค่ต้องล็อกอิน ไม่ได้จำกัด role",
  /AnyRole = Annotated\[CurrentUser, Depends\(get_current_user\)\]/.test(router),
);

// --- 3. the map never answers with money ---------------------------------
const MONEY_WORDS = /cost|price|amount|value|total|เงิน|ต้นทุน|ราคา|มูลค่า/i;
const outModels = [
  ...schemas.matchAll(/class (\w+Out)\(BaseModel\):[\s\S]*?(?=\n\nclass |\n*$)/g),
].map((match) => ({ name: match[1], body: match[0] }));

check.ok("อ่านโมเดลคำตอบออกมาได้จริง", outModels.length > 0, "nothing to assert against");
check.eq("มีโมเดลคำตอบครบ 4 ตัว", outModels.length, 4);
for (const model of outModels) {
  const fields = [...model.body.matchAll(/^    (\w+):/gm)].map((m) => m[1]);
  check.ok(`อ่านฟิลด์ของ ${model.name} ได้`, fields.length > 0, "nothing to assert against");
  check.eq(
    `${model.name} ไม่มีฟิลด์เกี่ยวกับเงินเลย`,
    fields.filter((field) => MONEY_WORDS.test(field)),
    [],
  );
}
check.ok(
  "SQL ของผังไม่ได้ SELECT ฟิลด์ต้นทุน/ราคาจากตารางไหนเลย",
  !/unit_cost|selling_price|total_amount|stock_value/.test(service),
  "D32/D33: the map answers where, never how much",
);

// --- 4. the map is an option, not a system --------------------------------
check.ok(
  "ไม่มีผัง = ตอบ map: null ไม่ใช่ 404",
  /"map": None, "shapes": \[\], "points": \[\]/.test(service),
  "a 404 would make the page show an error where it should say there is no map yet",
);
// Two queries build a point: the whole-map read and the single-point read
// after a write. Asserting the count appears "somewhere" let one of them be
// replaced by a hardcoded zero while the other kept the check green.
const countedByDb = (service.match(/count\(pm\.medicine_id\)::int AS medicine_count/g) ?? []).length;
check.ok(
  "จำนวนยาในแต่ละจุดนับมาจากฐานข้อมูลทุกที่ที่สร้าง PointOut",
  countedByDb >= 2,
  `found ${countedByDb} of the 2 queries that build a point`,
);
check.ok(
  "ไม่มีที่ไหนใส่จำนวนยาเป็นค่าตายตัว",
  !/\d+ AS medicine_count/.test(service),
  "a literal here would report every mark as empty",
);
// Read as a number, not as text: "MAX_POINTS = 1000" is a substring of
// "MAX_POINTS = 100000", so a text match would raise the cap by a hundredfold
// and still pass.
const maxPoints = Number(/MAX_POINTS = (\d+)\b/.exec(schemas)?.[1] ?? 0);
check.eq("เพดานคือ 1000 จุดพอดี", maxPoints, 1000);
check.ok(
  "เพดานถูกบังคับจริงในโค้ด ไม่ใช่ประกาศไว้เฉย ๆ",
  />= MAX_POINTS/.test(service),
);

process.exit(check.done() ? 1 : 0);
