import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Mock the supabase-server module so we control supabasePublic.rpc() without
// hitting a real database.  We mock the module rather than @supabase/supabase-js
// directly so we don't need to worry about createServerClient / cookies()
// plumbing that lives in the same file.
vi.mock('@/lib/supabase-server', () => ({
  supabasePublic: {
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      state.lastRpcCall = { fn, params };
      if (fn === 'check_and_increment_dual_rate_limit' && state.dualRpcResponse !== null) {
        return { data: state.dualRpcResponse, error: null };
      }
      return state.rpcResponse;
    }),
  },
}));

import { hashIp, checkRateLimit, checkAgentWriteAllowed, resolveAgentWriteLimit, enforceAgentWriteRateLimit } from '@/lib/rate-limit';

beforeEach(() => {
  state.rpcResponse = { data: true, error: null };
  state.lastRpcCall = null;
  state.dualRpcResponse = null;
  vi.clearAllMocks();
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
// resolveAgentWriteLimit
//
// The shared outcome classifier both REST routes (via enforceAgentWriteRateLimit)
// and the MCP route call — one place for the ok/rate_limited/service_unavailable
// mapping so REST and MCP can't drift.
// ---------------------------------------------------------------------------

describe('resolveAgentWriteLimit', () => {
  it("returns 'ok' when within budget", async () => {
    state.dualRpcResponse = true;
    const result = await resolveAgentWriteLimit('user-abc-123');
    expect(result).toBe('ok');
  });

  it("returns 'rate_limited' when the budget is exhausted", async () => {
    state.dualRpcResponse = false;
    const result = await resolveAgentWriteLimit('user-abc-123');
    expect(result).toBe('rate_limited');
  });

  it("returns 'service_unavailable' instead of throwing when the underlying RPC fails", async () => {
    state.rpcResponse = { data: null, error: { message: 'connection refused' } };
    const result = await resolveAgentWriteLimit('user-abc-123');
    expect(result).toBe('service_unavailable');
  });
});

// ---------------------------------------------------------------------------
// enforceAgentWriteRateLimit
//
// The REST-facing wrapper every write route calls — translates
// resolveAgentWriteLimit's outcome into a NextResponse or null (proceed).
// ---------------------------------------------------------------------------

describe('enforceAgentWriteRateLimit', () => {
  it('returns null (proceed) when within budget', async () => {
    state.dualRpcResponse = true;
    const result = await enforceAgentWriteRateLimit('user-abc-123');
    expect(result).toBeNull();
  });

  it('returns a 429 NextResponse when the write budget is exhausted', async () => {
    state.dualRpcResponse = false;
    const result = await enforceAgentWriteRateLimit('user-abc-123');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
    const body = await result?.json();
    expect(body.error).toBeDefined();
  });

  it('returns a 503 NextResponse instead of throwing when the underlying RPC fails', async () => {
    state.rpcResponse = { data: null, error: { message: 'connection refused' } };
    const result = await enforceAgentWriteRateLimit('user-abc-123');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(503);
    const body = await result?.json();
    expect(body.error).toBeDefined();
  });
});
