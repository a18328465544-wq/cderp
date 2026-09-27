import { runCrmMigration } from "./crmMigration.ts";

const apply = process.argv.includes("--apply");
const report = await runCrmMigration(!apply);
console.log(JSON.stringify(report, null, 2));
