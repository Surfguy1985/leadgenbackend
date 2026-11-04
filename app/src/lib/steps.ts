/** Idempotent step runner. A step whose key is already recorded as done is skipped; completion is written to the audit log. */
export type StepStore = { isDone(key: string): Promise<boolean>; markDone(key: string, meta: Record<string, unknown>): Promise<void> };
export async function runStep<T extends Record<string, unknown>>(store: StepStore, key: string, fn: () => Promise<T>): Promise<{ skipped: true } | ({ skipped: false } & T)> {
  if (await store.isDone(key)) return { skipped: true };
  const out = await fn();
  await store.markDone(key, out);
  return { skipped: false, ...out };
}
/** Audit-log backed store. object_type "workflow_step", object_id = step key, action "step_done". */
type Db = { from(t: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export function auditStore(db: Db, actor = "app:workflows"): StepStore {
  return {
    async isDone(key) {
      const { data } = await db.from("audit_logs").select("id").eq("object_type", "workflow_step").eq("object_id", key).eq("action", "step_done").limit(1);
      return !!data?.length;
    },
    async markDone(key, meta) { await db.from("audit_logs").insert({ actor, action: "step_done", object_type: "workflow_step", object_id: key, metadata: meta }); },
  };
}
/** Retry backoff used by record_workflow_failure: 1,2,4,8,16 minutes, then dead_letter after 5 attempts. */
export const backoffMinutes = (attempt: number) => (attempt >= 5 ? null : 2 ** attempt);
