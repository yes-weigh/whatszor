--[[
  dequeue_counter.lua
  ──────────────────────────────────────────────────────────────────────────────
  Atomic INCR + PEXPIRE for the backpressure dequeue rate counter.

  The non-Lua version (INCR then EXPIRE in two round trips) has a subtle bug:
  if the process crashes between INCR and EXPIRE, the key lives forever.
  This script makes the two operations atomic.

  KEYS[1]  — Counter key (e.g. "bp:deq:outbound-messages")
  ARGV[1]  — TTL in milliseconds (e.g. "60000" for 60 seconds)

  Returns: current count after increment
--]]

local key    = KEYS[1]
local ttl_ms = tonumber(ARGV[1])

local count = redis.call('INCR', key)

-- Only set expiry on first increment so we don't reset the measurement window
if count == 1 then
    redis.call('PEXPIRE', key, ttl_ms)
end

return count
