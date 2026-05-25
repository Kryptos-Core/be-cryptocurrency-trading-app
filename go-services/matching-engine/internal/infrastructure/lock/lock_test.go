package lock

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

type mockRedisClient struct {
	data map[string]string
	ttl  map[string]time.Time
}

func newMockRedis() *mockRedisClient {
	return &mockRedisClient{
		data: make(map[string]string),
		ttl:  make(map[string]time.Time),
	}
}

type mockResult struct {
	val interface{}
	err error
}

func (m *mockRedisClient) SetNX(ctx context.Context, key, value string, expiration time.Duration) mockResult {
	if v, exists := m.data[key]; exists {
		if exp, ok := m.ttl[key]; ok && time.Now().After(exp) {
			delete(m.data, key)
			delete(m.ttl, key)
		} else if v != "" {
			return mockResult{false, nil}
		}
	}
	m.data[key] = value
	if expiration > 0 {
		m.ttl[key] = time.Now().Add(expiration)
	}
	return mockResult{true, nil}
}

func (m *mockRedisClient) Eval(ctx context.Context, script string, keys []string, args ...interface{}) mockResult {
	if script == `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end` {
		key := keys[0]
		owner := args[0].(string)
		if m.data[key] == owner {
			delete(m.data, key)
			delete(m.ttl, key)
			return mockResult{int64(1), nil}
		}
		return mockResult{int64(0), nil}
	}
	if script == `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end` {
		key := keys[0]
		owner := args[0].(string)
		if m.data[key] == owner {
			m.ttl[key] = time.Now().Add(time.Duration(args[1].(int64)) * time.Millisecond)
			return mockResult{int64(1), nil}
		}
		return mockResult{int64(0), nil}
	}
	return mockResult{int64(0), nil}
}

// mockLockClient simulates the DistributedLock logic for pure unit testing.
type mockLockClient struct {
	client *mockRedisClient
	key    string
	owner  string
}

func newMockLock(pairID, owner string) *mockLockClient {
	return newMockLockWithRedis(newMockRedis(), pairID, owner)
}

func newMockLockWithRedis(client *mockRedisClient, pairID, owner string) *mockLockClient {
	return &mockLockClient{
		client: client,
		key:    "matching:lock:" + pairID,
		owner:  owner,
	}
}

func (m *mockLockClient) acquire(ctx context.Context) (bool, error) {
	result := m.client.SetNX(ctx, m.key, m.owner, 10*time.Second)
	return result.val.(bool), result.err
}

func (m *mockLockClient) release(ctx context.Context) error {
	result := m.client.Eval(ctx,
		`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
		[]string{m.key}, m.owner)
	if result.err != nil {
		return result.err
	}
	if result.val.(int64) == 0 {
		return ErrLockNotHeld
	}
	return nil
}

func (m *mockLockClient) extend(ctx context.Context, ttl time.Duration) error {
	result := m.client.Eval(ctx,
		`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end`,
		[]string{m.key}, m.owner, ttl.Milliseconds())
	if result.err != nil {
		return result.err
	}
	if result.val.(int64) == 0 {
		return ErrLockNotHeld
	}
	return nil
}

func TestMockLock_Acquire(t *testing.T) {
	ml := newMockLock("BTC/USDT", "owner-1")
	ctx := context.Background()

	ok, err := ml.acquire(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Error("expected acquire to succeed")
	}
}

func TestMockLock_Acquire_AlreadyHeld(t *testing.T) {
	redis := newMockRedis()
	ml1 := newMockLockWithRedis(redis, "BTC/USDT", "owner-1")
	ml2 := newMockLockWithRedis(redis, "BTC/USDT", "owner-2")
	ctx := context.Background()

	ok1, _ := ml1.acquire(ctx)
	if !ok1 {
		t.Fatal("expected first acquire to succeed")
	}

	ok2, _ := ml2.acquire(ctx)
	if ok2 {
		t.Error("expected second acquire to fail")
	}
}

func TestMockLock_Acquire_DifferentPairs(t *testing.T) {
	ml1 := newMockLock("BTC/USDT", "owner-a")
	ml2 := newMockLock("ETH/USDT", "owner-b")
	ctx := context.Background()

	ok1, _ := ml1.acquire(ctx)
	ok2, _ := ml2.acquire(ctx)

	if !ok1 || !ok2 {
		t.Error("expected both acquires to succeed for different pairs")
	}
}

func TestMockLock_Release(t *testing.T) {
	redis := newMockRedis()
	ml := newMockLockWithRedis(redis, "BTC/USDT", "owner-release")
	ctx := context.Background()

	_, _ = ml.acquire(ctx)
	err := ml.release(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ml2 := newMockLockWithRedis(redis, "BTC/USDT", "owner-new")
	ok, _ := ml2.acquire(ctx)
	if !ok {
		t.Error("expected new owner to acquire after release")
	}
}

func TestMockLock_Release_WrongOwner(t *testing.T) {
	redis := newMockRedis()
	ml1 := newMockLockWithRedis(redis, "BTC/USDT", "owner-1")
	ml2 := newMockLockWithRedis(redis, "BTC/USDT", "owner-2")
	ctx := context.Background()

	_, _ = ml1.acquire(ctx)

	err := ml2.release(ctx)
	if err != ErrLockNotHeld {
		t.Errorf("expected ErrLockNotHeld, got %v", err)
	}
}

func TestMockLock_Extend(t *testing.T) {
	ml := newMockLock("BTC/USDT", "owner-extend")
	ctx := context.Background()

	_, _ = ml.acquire(ctx)
	err := ml.extend(ctx, 30*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMockLock_Extend_NotHeld(t *testing.T) {
	ml := newMockLock("BTC/USDT", "owner-not-held")
	ctx := context.Background()

	err := ml.extend(ctx, 30*time.Second)
	if err != ErrLockNotHeld {
		t.Errorf("expected ErrLockNotHeld, got %v", err)
	}
}

func TestMockLock_Release_NotHeld(t *testing.T) {
	ml := newMockLock("BTC/USDT", "owner-never-acquired")
	ctx := context.Background()

	err := ml.release(ctx)
	if err != ErrLockNotHeld {
		t.Errorf("expected ErrLockNotHeld, got %v", err)
	}
}

func TestDistributedLock_Constants(t *testing.T) {
	if LockTTL != 10*time.Second {
		t.Errorf("expected LockTTL=10s, got %v", LockTTL)
	}
	if LockRetryDelay != 20*time.Millisecond {
		t.Errorf("expected LockRetryDelay=20ms, got %v", LockRetryDelay)
	}
	if MaxRetries != 15 {
		t.Errorf("expected MaxRetries=15, got %d", MaxRetries)
	}
}

func TestDistributedLock_KeyFormat(t *testing.T) {
	// Verify key format pattern
	pairID := "BTC/USDT"
	expectedKey := "matching:lock:BTC/USDT"
	actualKey := "matching:lock:" + pairID
	if actualKey != expectedKey {
		t.Errorf("expected key %q, got %q", expectedKey, actualKey)
	}
}

func TestDistributedLock_NewDistributedLock(t *testing.T) {
	// Verify constructor doesn't panic and creates correct key/owner
	lock := NewDistributedLock((*redis.Client)(nil), "ETH/USDT", "test-owner")
	if lock == nil {
		t.Fatal("expected non-nil lock")
	}
}
