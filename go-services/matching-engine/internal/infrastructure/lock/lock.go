package lock

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	ErrLockNotAcquired = errors.New("failed to acquire lock")
	ErrLockNotHeld     = errors.New("lock not held")
)

const (
	LockTTL        = 10 * time.Second
	LockRetryDelay = 20 * time.Millisecond
	MaxRetries     = 15
)

// DistributedLock manages a Redis-based distributed lock for a trading pair.
type DistributedLock struct {
	redis *redis.Client
	key   string
	value string // unique identifier for this lock holder
}

// NewDistributedLock creates a lock for the given pairID.
// value should be a unique identifier (e.g., instance ID + goroutine ID).
func NewDistributedLock(redisClient *redis.Client, pairID, value string) *DistributedLock {
	return &DistributedLock{
		redis: redisClient,
		key:   fmt.Sprintf("matching:lock:%s", pairID),
		value: value,
	}
}

// Acquire attempts to acquire the lock with retries.
// Returns nil on success, ErrLockNotAcquired on failure.
func (l *DistributedLock) Acquire(ctx context.Context) error {
	var err error
	for attempt := 0; attempt < MaxRetries; attempt++ {
		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled during lock acquisition: %w", ctx.Err())
		default:
		}

		// Use SET NX EX (atomic set-if-not-exists with expiry)
		ok, setErr := l.redis.SetNX(ctx, l.key, l.value, LockTTL).Result()
		if setErr != nil {
			err = setErr
			time.Sleep(LockRetryDelay)
			continue
		}

		if ok {
			return nil
		}

		// Exponential backoff with jitter after first few failures
		delay := LockRetryDelay
		if attempt >= 3 {
			// Add exponential backoff: 20ms * 2^(attempt-3) + random jitter
			backoff := time.Duration(1<<uint(attempt-3)) * LockRetryDelay
			jitter := time.Duration(attempt*5) * time.Millisecond // Simple linear jitter
			delay = backoff + jitter
			if delay > 500*time.Millisecond {
				delay = 500 * time.Millisecond // Cap at 500ms
			}
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled during lock acquisition: %w", ctx.Err())
		case <-time.After(delay):
		}
	}

	if err != nil {
		return fmt.Errorf("failed to acquire lock after %d attempts: %w: %v", MaxRetries, ErrLockNotAcquired, err)
	}
	return fmt.Errorf("failed to acquire lock after %d attempts: %w", MaxRetries, ErrLockNotAcquired)
}

// Release releases the lock if held.
// Uses Lua script for atomic check-and-delete:
//   if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end
// Returns nil on success, ErrLockNotHeld if lock was not held.
func (l *DistributedLock) Release(ctx context.Context) error {
	// Lua script for atomic check-and-delete
	const luaScript = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`

	result, err := l.redis.Eval(ctx, luaScript, []string{l.key}, l.value).Int64()
	if err != nil {
		return fmt.Errorf("failed to execute release script: %w", err)
	}

	if result == 0 {
		return fmt.Errorf("lock key=%s value=%s: %w", l.key, l.value, ErrLockNotHeld)
	}

	return nil
}

// Extend extends the lock TTL if still held.
func (l *DistributedLock) Extend(ctx context.Context, ttl time.Duration) error {
	// Lua script for atomic check-and-extend
	const luaScript = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end`

	result, err := l.redis.Eval(ctx, luaScript, []string{l.key}, l.value, ttl.Milliseconds()).Int64()
	if err != nil {
		return fmt.Errorf("failed to extend lock: %w", err)
	}

	if result == 0 {
		return fmt.Errorf("lock not held: %w", ErrLockNotHeld)
	}

	return nil
}
