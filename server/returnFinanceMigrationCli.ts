import { createManualBackup } from "./db.ts";
import { runReturnFinanceMigration } from "./returnFinanceMigration.ts";

const apply = process.argv.includes("--apply");

if (apply && process.env.RETURN_FINANCE_REPAIR_CONFIRM !== "apply") {
  console.error("安全修复需要显式确认：RETURN_FINANCE_REPAIR_CONFIRM=apply npm run return-finance:audit -- --apply");
  process.exitCode = 1;
} else {
  try {
    const backup = apply ? await createManualBackup() : undefined;
    const report = await runReturnFinanceMigration(!apply);
    console.log(JSON.stringify({ ...report, ...(backup ? { backup } : {}) }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
