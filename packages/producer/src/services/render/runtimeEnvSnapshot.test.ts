/**
 * Tests for the `snapshotRuntimeEnv` helper that backs the
 * `LockedRenderConfig.runtimeEnv` field.
 */

import { describe, expect, it } from "bun:test";
import { RUNTIME_ENV_PREFIXES, snapshotRuntimeEnv } from "./runtimeEnvSnapshot.js";

describe("snapshotRuntimeEnv", () => {
  it("captures PRODUCER_RUNTIME_* keys", () => {
    const env = {
      PRODUCER_RUNTIME_RENDER_SEEK_MODE: "strict-boundary",
      PRODUCER_RUNTIME_RENDER_SEEK_OFFSET_FRACTION: "0.5",
    };
    expect(snapshotRuntimeEnv(env)).toEqual({
      PRODUCER_RUNTIME_RENDER_SEEK_MODE: "strict-boundary",
      PRODUCER_RUNTIME_RENDER_SEEK_OFFSET_FRACTION: "0.5",
    });
  });

  it("captures PRODUCER_RENDER_* keys", () => {
    const env = {
      PRODUCER_RENDER_SEEK_STEP: "0.008",
    };
    expect(snapshotRuntimeEnv(env)).toEqual({
      PRODUCER_RENDER_SEEK_STEP: "0.008",
    });
  });

  it("captures both prefix families in a single snapshot", () => {
    const env = {
      PRODUCER_RUNTIME_RENDER_SEEK_MODE: "strict-boundary",
      PRODUCER_RENDER_SEEK_STEP: "0.008",
    };
    expect(snapshotRuntimeEnv(env)).toEqual({
      PRODUCER_RUNTIME_RENDER_SEEK_MODE: "strict-boundary",
      PRODUCER_RENDER_SEEK_STEP: "0.008",
    });
  });

  it("ignores keys that don't match either prefix", () => {
    const env = {
      PRODUCER_RUNTIME_RENDER_SEEK_MODE: "strict-boundary",
      HOME: "/home/ci",
      PATH: "/usr/bin:/bin",
      NODE_ENV: "production",
      // Off-by-one prefix variants — must NOT be captured.
      PRODUCER_RUNTIM_FOO: "x",
      PRODUCER_RENDR_BAR: "y",
      PRODUCER_DEBUG_SEEK_DIAGNOSTICS: "true",
    };
    const snapshot = snapshotRuntimeEnv(env);
    expect(snapshot).toEqual({
      PRODUCER_RUNTIME_RENDER_SEEK_MODE: "strict-boundary",
    });
    expect(Object.keys(snapshot)).toHaveLength(1);
  });

  it("skips keys whose value is undefined", () => {
    const env = {
      PRODUCER_RUNTIME_RENDER_SEEK_MODE: "strict-boundary",
      PRODUCER_RUNTIME_OTHER: undefined,
    };
    expect(snapshotRuntimeEnv(env)).toEqual({
      PRODUCER_RUNTIME_RENDER_SEEK_MODE: "strict-boundary",
    });
  });

  it("returns an empty object when no keys match", () => {
    expect(snapshotRuntimeEnv({ HOME: "/home/ci", PATH: "/usr/bin" })).toEqual({});
  });

  it("returns a NEW object each call (no live reference to process.env)", () => {
    const env = { PRODUCER_RUNTIME_X: "v1" };
    const first = snapshotRuntimeEnv(env);
    env.PRODUCER_RUNTIME_X = "v2";
    const second = snapshotRuntimeEnv(env);
    expect(first.PRODUCER_RUNTIME_X).toBe("v1");
    expect(second.PRODUCER_RUNTIME_X).toBe("v2");
    expect(first).not.toBe(second);
  });

  it("defaults to process.env when no argument is passed", () => {
    const key = `PRODUCER_RUNTIME_FREEZEPLAN_TEST_${Date.now()}`;
    const sentinel = "freezeplan-test-value";
    process.env[key] = sentinel;
    try {
      const snapshot = snapshotRuntimeEnv();
      expect(snapshot[key]).toBe(sentinel);
    } finally {
      delete process.env[key];
    }
  });

  it("exports the prefix list for chunk-worker materialization", () => {
    // Chunk workers must apply the SAME prefix filter when reading the
    // snapshot back; asymmetric handling would let stale controller env
    // leak into chunk-worker behavior.
    expect(RUNTIME_ENV_PREFIXES).toEqual(["PRODUCER_RUNTIME_", "PRODUCER_RENDER_"]);
  });
});
