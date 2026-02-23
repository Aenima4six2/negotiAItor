import Database from "better-sqlite3";

const db = new Database("data/negotiaitor.db");
const rows = db.prepare("SELECT id, name, config, llm_config, browser_config, messages, summary, final_state, started_at, ended_at FROM sessions ORDER BY started_at ASC").all() as any[];

if (rows.length === 0) {
  console.log("No sessions to merge.");
  process.exit(0);
}

// Collect all unique messages by timestamp+sender+text
const seen = new Set<string>();
const merged: any[] = [];
for (const r of rows) {
  const msgs = JSON.parse(r.messages);
  for (const m of msgs) {
    const key = m.timestamp + "|" + m.sender + "|" + m.text;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(m);
  }
}
merged.sort((a: any, b: any) => a.timestamp - b.timestamp);

console.log("Sessions:", rows.length);
console.log("Per-session msg counts:", rows.map((r: any) => JSON.parse(r.messages).length).join(", "));
console.log("Unique messages after merge:", merged.length);

if (process.argv.includes("--dry-run")) {
  console.log("\nDry run — no changes made.");
  process.exit(0);
}

// Use the last session as the keeper (most complete metadata, latest summary)
const last = rows[rows.length - 1];
const first = rows[0];

// Update the keeper with merged messages and earliest start time
db.prepare("UPDATE sessions SET messages = ?, started_at = ? WHERE id = ?").run(
  JSON.stringify(merged),
  first.started_at,
  last.id,
);

// Delete the other sessions
const idsToDelete = rows.slice(0, -1).map((r: any) => r.id);
const placeholders = idsToDelete.map(() => "?").join(", ");
db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...idsToDelete);

console.log(`\nMerged into session ${last.id.slice(0, 8)} (${merged.length} messages)`);
console.log(`Deleted ${idsToDelete.length} duplicate sessions`);
