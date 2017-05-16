local queue = KEYS[1]
local current = ARGV[1]
local limit = ARGV[2]

local keys = redis.call('zrangebyscore', queue, '-inf', current, 'limit', 0, limit)
if #keys > 0 then
  redis.call('zremrangebyrank', queue, 0, #keys - 1)
end
return keys