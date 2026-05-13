/**
 * runtimeEnvSnapshot — capture / re-apply the env vars that drive in-page
 * render behavior.
 *
 * `fileServer.ts` reads several `PRODUCER_RUNTIME_*` and `PRODUCER_RENDER_*`
 * variables at module-load time and bakes them into the served HTML's
 * `RENDER_MODE_SCRIPT`. Distributed chunk workers are separate processes
 * that may inherit a different environment, so the plan freezes a snapshot
 * of the controller's env. The chunk worker then materializes the snapshot
 * back into `process.env` before launching its file server, which keeps the
 * served HTML byte-identical to what the controller would have served.
 *
 * Used by `freezePlan` (capture side) and the chunked render worker
 * (re-apply side). Kept here as a standalone utility because it has no
 * dependency on the plan-freeze pipeline.
 */

/**
 * Env-var name prefixes captured by {@link snapshotRuntimeEnv}. Exported so
 * the chunk-worker side can apply the same filter when materializing a
 * snapshot — asymmetric handling would leak stale controller env into
 * worker behavior.
 */
export const RUNTIME_ENV_PREFIXES: readonly string[] = [
  "PRODUCER_RUNTIME_",
  "PRODUCER_RENDER_",
] as const;

/**
 * Snapshot `process.env` keys that match any of {@link RUNTIME_ENV_PREFIXES}
 * into a plain string→string record. Returns a NEW object each call (never a
 * live reference to `process.env`) so subsequent mutations of the process
 * env do not retroactively change a frozen plan.
 *
 * Pass an optional `env` for tests that don't want to mutate the real
 * process env. The default reads `process.env`.
 */
export function snapshotRuntimeEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const key of Object.keys(env)) {
    const matches = RUNTIME_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
    if (!matches) continue;
    const value = env[key];
    // Skip undefined / non-string values. `process.env` only ever returns
    // strings, but `Record<string, string | undefined>` lets tests pass an
    // env object with explicit `undefined` slots (e.g. after `delete`).
    if (typeof value !== "string") continue;
    snapshot[key] = value;
  }
  return snapshot;
}
