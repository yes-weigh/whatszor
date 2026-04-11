--[[
  sliding_window_ratelimit.lua
  ──────────────────────────────────────────────────────────────────────────────
  Atomic sliding-window rate limiter using a Redis sorted set.

  Unlike the INCR+EXPIRE fixed-window approach, this script:
    1. Is fully atomic — all operations execute in a single EVAL call.
    2. Implements a TRUE sliding window — the window rolls with real time,
       not on a fixed 60-second boundary. A request at t=59s doesn't get
       reset at t=60s; it expires at t=119s.
    3. Returns the exact retry delay (ms until the oldest request falls off).

  KEYS[1]  — Redis key for the sorted set (e.g. "rl:sw:sess:abc123")
  ARGV[1]  — Current timestamp in milliseconds (Unix epoch ms)
  ARGV[2]  — Window size in milliseconds (e.g. "60000" for 60 seconds)
  ARGV[3]  — Max requests allowed in the window (e.g. "15")
  ARGV[4]  — Unique request ID (use jobId, traceId, or UUID to prevent dedup issues)

  Returns a Redis array: { allowed, current_count, retry_after_ms }
    allowed        — 1 if request is permitted, 0 if rate-limited
    current_count  — number of requests in window AFTER this call
    retry_after_ms — ms until next request is allowed (0 if allowed)
--]]

local key        = KEYS[1]
local now_ms     = tonumber(ARGV[1])
local window_ms  = tonumber(ARGV[2])
local max_req    = tonumber(ARGV[3])
local req_id     = ARGV[4]

-- Window boundary: drop everything older than this
local window_start = now_ms - window_ms

-- 1. Prune entries that have fallen outside the sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- 2. Count requests currently in the window (BEFORE adding this one)
local count = tonumber(redis.call('ZCARD', key))

if count >= max_req then
    -- Rate limited — find out when the OLDEST request will expire
    -- so we can give the caller the precise retry delay
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after_ms = 0
    if #oldest >= 2 then
        local oldest_ts = tonumber(oldest[2])
        retry_after_ms = math.max(0, (oldest_ts + window_ms) - now_ms + 1)
    else
        retry_after_ms = window_ms
    end

    -- Return without adding — the slot is NOT consumed on rejection
    return { 0, count, retry_after_ms }
end

-- 3. Admitted — add this request to the sorted set (score = timestamp)
--    Use req_id as member to guarantee uniqueness even if two requests
--    arrive at exactly the same millisecond.
redis.call('ZADD', key, now_ms, req_id)

-- 4. Set TTL so the key self-cleans when idle (window_ms + 5s buffer)
--    Use PEXPIRE (millisecond precision) to match our window units.
redis.call('PEXPIRE', key, window_ms + 5000)

return { 1, count + 1, 0 }
