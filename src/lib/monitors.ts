import type { Invariance, Monitor, MonitorEvaluateResult, MonitorSignal, MonitorEventsQuery, MonitorCompilePreview } from '@invariance/sdk';
import { hospitalMonitorRules, extractMonitorKey, toCreateBody } from '../policies/monitor-rules.js';
import type { MonitorRule } from '../policies/monitor-rules.js';

/**
 * Manages hospital natural-language monitors via the Invariance SDK.
 * Handles idempotent setup, reconciliation, evaluation, and teardown.
 */
export class HospitalMonitorManager {
  private readonly inv: Invariance;
  private managedMonitors: Monitor[] = [];

  constructor(inv: Invariance) {
    this.inv = inv;
  }

  /**
   * Create or reconcile all hospital monitor rules.
   * Idempotent: matches existing monitors by stable key, updates if rule/severity/agent changed.
   */
  async setupAll(): Promise<Monitor[]> {
    const existing = await this.inv.monitors.list();
    const existingByKey = new Map<string, Monitor>();
    for (const m of existing) {
      const key = extractMonitorKey(m.name);
      if (key) existingByKey.set(key, m);
    }

    const result: Monitor[] = [];

    for (const rule of hospitalMonitorRules) {
      const existing = existingByKey.get(rule.key);
      if (existing) {
        // Reconcile: update if NL rule, severity, or agent_id changed
        if (needsUpdate(existing, rule)) {
          const updated = await this.inv.monitors.update(existing.id, {
            natural_language: rule.natural_language,
            severity: rule.severity,
            agent_id: rule.agent_id,
          });
          result.push(updated);
        } else {
          result.push(existing);
        }
      } else {
        const created = await this.inv.monitors.create(toCreateBody(rule));
        result.push(created);
      }
    }

    this.managedMonitors = result;
    return result;
  }

  /**
   * Delete only monitors owned by this integration (identified by the hospy key prefix).
   */
  async teardownAll(): Promise<void> {
    const all = await this.inv.monitors.list();
    for (const m of all) {
      const key = extractMonitorKey(m.name);
      if (key) {
        await this.inv.monitors.delete(m.id);
      }
    }
    this.managedMonitors = [];
  }

  /**
   * Evaluate all active managed monitors.
   * Falls back to per-monitor evaluation if batch evaluate fails.
   */
  async evaluateAll(): Promise<MonitorEvaluateResult[]> {
    try {
      const batchResult = await this.inv.monitors.evaluateAll();
      return Array.isArray(batchResult) ? batchResult : [];
    } catch {
      // Fall back to per-monitor evaluation
      const results: MonitorEvaluateResult[] = [];
      for (const m of this.managedMonitors) {
        if (m.status !== 'active') continue;
        const result = await this.inv.monitors.evaluate(m.id);
        results.push(result);
      }
      return results;
    }
  }

  /**
   * Fetch monitor events from the backend.
   */
  async getEvents(opts?: MonitorEventsQuery): Promise<{ events: MonitorSignal[]; next_cursor?: string }> {
    return this.inv.monitors.listEvents(opts);
  }

  /**
   * Acknowledge all unacknowledged events.
   */
  async acknowledgeAllUnacknowledged(): Promise<number> {
    const { events } = await this.inv.monitors.listEvents({ acknowledged: false });
    for (const event of events) {
      await this.inv.monitors.acknowledgeEvent(event.id);
    }
    return events.length;
  }

  /**
   * Preview how a natural-language rule compiles.
   */
  async previewRule(rule: string): Promise<MonitorCompilePreview> {
    return this.inv.monitors.compilePreview(rule);
  }

  /** Get the list of monitors managed in the last setupAll() call. */
  getManaged(): readonly Monitor[] {
    return this.managedMonitors;
  }
}

/**
 * Polls for new monitor events on an interval.
 */
export class MonitorPoller {
  private readonly inv: Invariance;
  private readonly intervalMs: number;
  private readonly onEvent: (event: MonitorSignal) => void | Promise<void>;
  private readonly onError?: (err: unknown) => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSeenEventId: string | undefined;
  private polling = false;

  constructor(
    inv: Invariance,
    intervalMs: number,
    onEvent: (event: MonitorSignal) => void | Promise<void>,
    onError?: (err: unknown) => void,
  ) {
    this.inv = inv;
    this.intervalMs = intervalMs;
    this.onEvent = onEvent;
    this.onError = onError;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Run a single poll cycle (also callable manually). */
  async poll(): Promise<void> {
    if (this.polling) return; // prevent overlapping polls
    this.polling = true;
    try {
      const { events } = await this.inv.monitors.listEvents({
        after_id: this.lastSeenEventId,
        acknowledged: false,
      });
      for (const event of events) {
        this.lastSeenEventId = event.id;
        await this.onEvent(event);
      }
    } catch (err) {
      if (this.onError) this.onError(err);
    } finally {
      this.polling = false;
    }
  }
}

function needsUpdate(existing: Monitor, rule: MonitorRule): boolean {
  if (existing.natural_language !== rule.natural_language) return true;
  if (existing.severity !== rule.severity) return true;
  if ((existing.agent_id ?? undefined) !== rule.agent_id) return true;
  return false;
}
