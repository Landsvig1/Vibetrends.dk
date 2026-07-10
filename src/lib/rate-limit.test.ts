import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared state, hoisted above all imports so the vi.mock factory can close
// over it — same pattern as supabase-server.test.ts.
const state = vi.hoisted(() => ({
  rpcResponse: { data: true as boolean | null, error: null as { message: string } | null },
  lastRpcCall: null as { fn: string; params: Record<string, unknown> } | null,
}));

// Mock the supabase-server module so we control supabasePublic.rpc() without
// hitting a real database.  We mock the module rather than @supabase/supabase-js
// directly so we don't need to worry about createServerClient / cookies()
// plumbing that lives in the same file.
vi.mock('@/lib/supabase-server', () => ({
  supabasePublic: {
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      state.lastRpcCall = { fn, params };
      return state.rpcResponse;
    }),
  },
}));

import { hashIp, checkRateLimit, checkAgentWriteRateLimit } from '@/lib/rate-limit';

beforeEach(() => {
  state.rpcResponse = { data: true, error: null };
  state.lastRpcCall = null;
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
// checkAgentWriteRateLimit
// ---------------------------------------------------------------------------

describe('checkAgentWriteRateLimit', () => {
  it('scopes the rate-limit key to the identity, not the IP', async () => {
    await checkAgentWriteRateLimit('user-abc-123');
    expect(state.lastRpcCall?.params).toMatchObject({
      p_key: 'agentwrite:user-abc-123',
    });
  });

  it('returns false once the identity has exceeded its write budget', async () => {
    state.rpcResponse = { data: false, error: null };
    const result = await checkAgentWriteRateLimit('user-abc-123');
    expect(result).toBe(false);
  });

  it('returns true while the identity is within its write budget', async () => {
    state.rpcResponse = { data: true, error: null };
    const result = await checkAgentWriteRateLimit('user-abc-123');
    expect(result).toBe(true);
  });
});
