local queue = KEYS[1]
local current = ARGV[1]
local limit = ARGV[2]

local keys = redis.call('zrangebyscore', queue, '-inf', current, 'limit', 0, limit)
if #keys then
  redis.call('zremrangebyrank', queue, 0, #keys)
end
return keys