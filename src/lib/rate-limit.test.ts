import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

// Shared state, hoisted above all imports so the vi.mock factory can close
// over it — same pattern as supabase-server.test.ts.
const state = vi.hoisted(() => ({
  rpcResponse: { data: true as boolean | null, error: null as { message: string } | null },
  lastRpcCall: null as { fn: string; params: Record<string, unknown> } | null,
  // Override the dual-check RPC's response — used by checkAgentWriteAllowed
  // tests to simulate the identity/global budgets independently even though
  // they're now checked in a single round trip.
  dualRpcResponse: null as boolean | null,
}));

// Mock the supabase-server module so we control the RPC without hitting a real
// database.  We mock the module rather than @supabase/supabase-js directly so
// we don't need to worry about createServerClient / cookies() plumbing that
// lives in the same file.
//
// These RPCs go through the SERVICE-ROLE client, not the anon one: the
// functions are no longer EXECUTE-granted to anon (migration
// 20260809000000_rate_limit_rpc_revoke_anon_execute.sql). `supabasePublic` is
// still exported here so a future accidental switch back to it fails on the
// grant rather than silently working in tests.
vi.mock('@/lib/supabase-server', () => ({
  getSupabaseServiceRole: vi.fn(() => ({
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      state.lastRpcCall = { fn, params };
      if (fn === 'check_and_increment_dual_rate_limit' && state.dualRpcResponse !== null) {
        return { data: state.dualRpcResponse, error: null };
      }
      return state.rpcResponse;
    }),
  })),
  supabasePublic: {
    rpc: vi.fn(async () => {
      throw new Error(
        'Rate-limit RPCs must use the service-role client — anon has no EXECUTE grant.',
      );
    }),
  },
}));

import { hashIp, checkRateLimit, checkAgentWriteAllowed, checkHumanWriteAllowed, resolveWriteLimit, enforceWriteRateLimit } from '@/lib/rate-limit';
import { getSupabaseServiceRole, supabasePublic } from '@/lib/supabase-server';

beforeEach(() => {
  state.rpcResponse = { data: true, error: null };
  state.lastRpcCall = null;
  state.dualRpcResponse = null;
  // hashIp HMACs over this and throws without it. Stubbed per test so the
  // "missing salt" case below can unset it without leaking into other tests.
  vi.stubEnv('RATE_LIMIT_IP_SALT', 'test-salt-not-a-real-secret');
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// hashIp
// ---------------------------------------------------------------------------

describe('hashIp', () => {
  it('returns the same hash for the same input', () => {
    expect(hashIp('192.168.1.1')).toBe(hashIp('192.168.1.1'));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashIp('192.168.1.1')).not.toBe(hashIp('10.0.0.1'));
  });

  it('returns a hex string (64 chars for SHA-256)', () => {
    const hash = hashIp('203.0.113.42');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never includes the raw IP as a substring of the output', () => {
    const ip = '203.0.113.42';
    const hash = hashIp(ip);
    expect(hash).not.toContain(ip);
  });

  /**
   * The point of the 2026-08-13 change. A bare sha256(ip) is not a pseudonym:
   * IPv4 is 2^32, so anyone holding the digests can enumerate the whole space
   * and recover every address. These pin the properties that make the HMAC
   * actually do something, so a future "simplification" back to createHash
   * fails loudly instead of quietly restoring a reversible identifier.
   */
  it('produces a different digest under a different salt (the salt is real)', () => {
    vi.stubEnv('RATE_LIMIT_IP_SALT', 'salt-a');
    const a = hashIp('203.0.113.42');
    vi.stubEnv('RATE_LIMIT_IP_SALT', 'salt-b');
    const b = hashIp('203.0.113.42');
    expect(a).not.toBe(b);
  });

  it('does not equal the unsalted sha256 of the same IP', () => {
    const ip = '203.0.113.42';
    const unsalted = createHash('sha256').update(ip).digest('hex');
    expect(hashIp(ip)).not.toBe(unsalted);
  });

  it('is stable across calls for a fixed salt (buckets must not rotate)', () => {
    vi.stubEnv('RATE_LIMIT_IP_SALT', 'fixed');
    expect(hashIp('198.51.100.7')).toBe(hashIp('198.51.100.7'));
  });

  it('throws when the salt is missing rather than silently falling back', () => {
    vi.stubEnv('RATE_LIMIT_IP_SALT', '');
    expect(() => hashIp('203.0.113.42')).toThrow('RATE_LIMIT_IP_SALT');
  });
});

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  it('returns true when the RPC indicates the caller is within the limit', async () => {
    state.rpcResponse = { data: true, error: null };
    const result = await checkRateLimit('test-key', 10, 60);
    expect(result).toBe(true);
  });

  it('returns false when the RPC indicates the limit has been exceeded', async () => {
    state.rpcResponse = { data: false, error: null };
    const result = await checkRateLimit('test-key', 10, 60);
    expect(result).toBe(false);
  });

  it('calls the RPC with the correct function name', async () => {
    await checkRateLimit('some-key', 5, 30);
    expect(state.lastRpcCall?.fn).toBe('check_and_increment_rate_limit');
  });

  it('maps key → p_key, limit → p_limit, windowSeconds → p_window_seconds', async () => {
    await checkRateLimit('hashed-ip-abc', 3, 120);
    expect(state.lastRpcCall?.params).toEqual({
      p_key: 'hashed-ip-abc',
      p_limit: 3,
      p_window_seconds: 120,
    });
  });

  it('throws when the RPC returns an error', async () => {
    state.rpcResponse = { data: null, error: { message: 'connection refused' } };
    await expect(checkRateLimit('key', 5, 60)).rejects.toThrow('Rate limit RPC failed');
  });
});

// ---------------------------------------------------------------------------
// Client selection — regression guard
// ---------------------------------------------------------------------------

describe('rate-limit RPCs use the service-role client', () => {
  /**
   * Not a style preference. `check_and_increment_rate_limit` and
   * `check_and_increment_dual_rate_limit` are no longer EXECUTE-granted to
   * `anon` (migration 20260809000000), because the anon key is public and the
   * caller chooses both the bucket key and the limit — which let anyone
   * exhaust `agentwrite:global` and deny writes to every agent site-wide.
   *
   * Switching either call site back to `supabasePublic` would restore that
   * hole AND break in production on the missing grant. The mock makes
   * `supabasePublic.rpc` throw, so these fail loudly if someone does.
   */
  it('resolves the service-role client for the single-key check', async () => {
    await expect(checkRateLimit('k', 5, 60)).resolves.toBe(true);
    expect(getSupabaseServiceRole).toHaveBeenCalled();
  });

  it('resolves the service-role client for the dual-key check', async () => {
    vi.mocked(getSupabaseServiceRole).mockClear();
    await checkAgentWriteAllowed('user-1');
    expect(getSupabaseServiceRole).toHaveBeenCalled();
  });

  it('never routes a rate-limit RPC through the anon client', async () => {
    await checkRateLimit('k', 5, 60);
    await checkAgentWriteAllowed('user-1');
    expect(vi.mocked(supabasePublic.rpc)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkAgentWriteAllowed
//
// Checks both the per-identity and global write budgets in a single atomic
// RPC call (check_and_increment_dual_rate_limit) — not two sequential
// check_and_increment_rate_limit calls — specifically so a write rejected by
// one budget never consumes the other. See src/lib/rate-limit.ts's doc
// comment for why the old sequential-check design let global congestion
// drain a well-behaved identity's own budget.
// ---------------------------------------------------------------------------

describe('checkAgentWriteAllowed', () => {
  it('calls the dual-check RPC exactly once, with both keys/limits and a shared window', async () => {
    state.dualRpcResponse = true;
    await checkAgentWriteAllowed('user-abc-123');
    expect(state.lastRpcCall?.fn).toBe('check_and_increment_dual_rate_limit');
    expect(state.lastRpcCall?.params).toEqual({
      p_key1: 'agentwrite:user-abc-123',
      p_limit1: 20,
      p_key2: 'agentwrite:global',
      p_limit2: 200,
      p_window_seconds: 3600,
    });
  });

  it('returns true when the RPC reports both budgets are within limit', async () => {
    state.dualRpcResponse = true;
    const result = await checkAgentWriteAllowed('user-abc-123');
    expect(result).toBe(true);
  });

  it('returns false when the RPC reports either budget is exhausted (identity, global, or both)', async () => {
    state.dualRpcResponse = false;
    const result = await checkAgentWriteAllowed('user-abc-123');
    expect(result).toBe(false);
  });

  it('throws when the RPC returns an error, same as checkRateLimit', async () => {
    state.rpcResponse = { data: null, error: { message: 'connection refused' } };
    await expect(checkAgentWriteAllowed('user-abc-123')).rejects.toThrow('Rate limit RPC failed');
  });
});

// ---------------------------------------------------------------------------
// checkHumanWriteAllowed
//
// Cookie-authenticated humans get their own per-user tier and no global tier:
// a human account costs a real signup, so the site-wide ceiling that bounds
// mass-provisioned agent identities isn't needed here.
// ---------------------------------------------------------------------------

describe('checkHumanWriteAllowed', () => {
  it('calls the single-key RPC with the humanwrite bucket, 60/hour', async () => {
    await checkHumanWriteAllowed('user-abc-123');
    expect(state.lastRpcCall?.fn).toBe('check_and_increment_rate_limit');
    expect(state.lastRpcCall?.params).toEqual({
      p_key: 'humanwrite:user-abc-123',
      p_limit: 60,
      p_window_seconds: 3600,
    });
  });

  it('returns false when the budget is exhausted', async () => {
    state.rpcResponse = { data: false, error: null };
    await expect(checkHumanWriteAllowed('user-abc-123')).resolves.toBe(false);
  });

  it('throws when the RPC returns an error', async () => {
    state.rpcResponse = { data: null, error: { message: 'connection refused' } };
    await expect(checkHumanWriteAllowed('user-abc-123')).rejects.toThrow('Rate limit RPC failed');
  });
});

// ---------------------------------------------------------------------------
// resolveWriteLimit
//
// The shared outcome classifier both REST routes (via enforceWriteRateLimit)
// and the MCP route call. It picks the tier from the identity (bearer agent
// or cookie human) so no call site chooses, and owns the
// ok/rate_limited/service_unavailable mapping so REST and MCP can't drift.
// ---------------------------------------------------------------------------

const agent = { user: { id: 'agent-1' }, botAuth: { user: { id: 'agent-1' } } };
const human = { user: { id: 'human-1' } };

describe('resolveWriteLimit', () => {
  it('routes a bearer identity to the agent tier', async () => {
    state.dualRpcResponse = true;
    await resolveWriteLimit(agent);
    expect(state.lastRpcCall?.fn).toBe('check_and_increment_dual_rate_limit');
    expect(state.lastRpcCall?.params.p_key1).toBe('agentwrite:agent-1');
  });

  it('routes a cookie identity to the human tier', async () => {
    await resolveWriteLimit(human);
    expect(state.lastRpcCall?.fn).toBe('check_and_increment_rate_limit');
    expect(state.lastRpcCall?.params.p_key).toBe('humanwrite:human-1');
  });

  it("returns 'ok' when within budget", async () => {
    state.dualRpcResponse = true;
    await expect(resolveWriteLimit(agent)).resolves.toBe('ok');
    await expect(resolveWriteLimit(human)).resolves.toBe('ok');
  });

  it("returns 'rate_limited' when the budget is exhausted", async () => {
    state.dualRpcResponse = false;
    await expect(resolveWriteLimit(agent)).resolves.toBe('rate_limited');
    state.rpcResponse = { data: false, error: null };
    await expect(resolveWriteLimit(human)).resolves.toBe('rate_limited');
  });

  it("returns 'service_unavailable' instead of throwing when the underlying RPC fails", async () => {
    state.rpcResponse = { data: null, error: { message: 'connection refused' } };
    await expect(resolveWriteLimit(agent)).resolves.toBe('service_unavailable');
    await expect(resolveWriteLimit(human)).resolves.toBe('service_unavailable');
  });
});

// ---------------------------------------------------------------------------
// enforceWriteRateLimit
//
// The REST-facing wrapper every write route calls: translates
// resolveWriteLimit's outcome into a NextResponse or null (proceed).
// ---------------------------------------------------------------------------

describe('enforceWriteRateLimit', () => {
  it('returns null (proceed) when within budget', async () => {
    state.dualRpcResponse = true;
    await expect(enforceWriteRateLimit(agent)).resolves.toBeNull();
    await expect(enforceWriteRateLimit(human)).resolves.toBeNull();
  });

  it('returns a 429 NextResponse when a human exhausts their budget', async () => {
    state.rpcResponse = { data: false, error: null };
    const result = await enforceWriteRateLimit(human);
    expect(result?.status).toBe(429);
    const body = await result?.json();
    expect(body.error).toBeDefined();
  });

  it('returns a 429 NextResponse when an agent exhausts its budget', async () => {
    state.dualRpcResponse = false;
    const result = await enforceWriteRateLimit(agent);
    expect(result?.status).toBe(429);
  });

  it('returns a 503 NextResponse instead of throwing when the underlying RPC fails', async () => {
    state.rpcResponse = { data: null, error: { message: 'connection refused' } };
    const result = await enforceWriteRateLimit(human);
    expect(result?.status).toBe(503);
    const body = await result?.json();
    expect(body.error).toBeDefined();
  });
});
