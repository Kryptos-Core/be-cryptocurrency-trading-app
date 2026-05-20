import { Injectable, Logger } from '@nestjs/common';

/**
 * Circuit Breaker States
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit Breaker Configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of consecutive failures to trip circuit
  openDurationMs: number; // How long circuit stays open before transitioning to HALF_OPEN
  halfOpenMaxAttempts: number; // Max events to try in HALF_OPEN state
}

/**
 * Circuit Breaker Metrics
 */
export interface CircuitBreakerMetrics {
  consumerName: string;
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  openUntil: Date | null;
  halfOpenAttempts: number;
}

/**
 * CircuitBreaker
 *
 * Phase 5b: Circuit Breaker per Projection Consumer
 * Phase 6: Extended for Kafka producer circuit breaker with state-change callback
 *
 * Prevents cascading failures by stopping requests to a failing service.
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit tripped, requests fail immediately without attempting
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 *
 * @param onStateChange - Optional callback invoked on every state transition.
 *                        Useful for metrics updates and logging.
 */
@Injectable()
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private openUntil: Date | null = null;
  private halfOpenAttempts = 0;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig,
    private readonly logger: Logger,
    private readonly onStateChange?: (
      oldState: CircuitBreakerState,
      newState: CircuitBreakerState,
    ) => void,
  ) {}

  /**
   * Check if circuit allows requests
   */
  isAllowed(): boolean {
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        if (this.shouldTransitionToHalfOpen()) {
          this.transitionToHalfOpen();
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;

      default:
        return false;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.lastSuccess = new Date();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        this.failures = 0;
        this.successes++;
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.successes++;
        this.transitionToClosed();
        break;

      case CircuitBreakerState.OPEN:
        // Ignore successes while OPEN (shouldn't happen, but handle gracefully)
        break;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.lastFailure = new Date();
    this.failures++;

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        if (this.failures >= this.config.failureThreshold) {
          this.transitionToOpen();
        }
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.transitionToOpen();
        break;

      case CircuitBreakerState.OPEN:
        // Already open, just reset the timer
        if (this.shouldTransitionToHalfOpen()) {
          this.transitionToHalfOpen();
        }
        break;
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      consumerName: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      openUntil: this.openUntil,
      halfOpenAttempts: this.halfOpenAttempts,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Force state transition (for testing/admin)
   */
  forceState(state: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = state;
    this.logger.warn(`Circuit breaker ${this.name} forced to ${state}`);
    this.onStateChange?.(oldState, state);
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (!this.openUntil) return false;
    return Date.now() >= this.openUntil.getTime();
  }

  private transitionToOpen(): void {
    const oldState = this.state;
    this.state = CircuitBreakerState.OPEN;
    this.openUntil = new Date(Date.now() + this.config.openDurationMs);
    this.halfOpenAttempts = 0;
    this.logger.error(
      `Circuit breaker ${this.name} OPENED: failures=${this.failures} threshold=${this.config.failureThreshold} openUntil=${this.openUntil.toISOString()}`,
    );
    this.onStateChange?.(oldState, CircuitBreakerState.OPEN);
  }

  private transitionToHalfOpen(): void {
    const oldState = this.state;
    this.state = CircuitBreakerState.HALF_OPEN;
    this.openUntil = null;
    this.halfOpenAttempts = 0;
    this.logger.warn(
      `Circuit breaker ${this.name} transitioned to HALF_OPEN: testing recovery`,
    );
    this.onStateChange?.(oldState, CircuitBreakerState.HALF_OPEN);
  }

  private transitionToClosed(): void {
    const oldState = this.state;
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.openUntil = null;
    this.halfOpenAttempts = 0;
    this.logger.log(
      `Circuit breaker ${this.name} CLOSED: service recovered after ${this.successes} successes`,
    );
    this.onStateChange?.(oldState, CircuitBreakerState.CLOSED);
  }

  /**
   * Increment half-open attempts counter
   */
  incrementHalfOpenAttempts(): void {
    this.halfOpenAttempts++;
  }
}

/**
 * Circuit Breaker Registry
 *
 * Manages circuit breakers for all projection consumers
 */
@Injectable()
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly logger: Logger) {}

  /**
   * Get or create circuit breaker for a consumer
   */
  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(
        name,
        {
          failureThreshold: config?.failureThreshold ?? 3,
          openDurationMs: config?.openDurationMs ?? 30_000,
          halfOpenMaxAttempts: config?.halfOpenMaxAttempts ?? 1,
        },
        this.logger,
      );
      this.breakers.set(name, breaker);
      this.logger.debug(`Created circuit breaker for consumer: ${name}`);
    }
    return breaker;
  }

  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics(): CircuitBreakerMetrics[] {
    return Array.from(this.breakers.values()).map((b) => b.getMetrics());
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }
}
