/**
 * MetricsCollector — wraps an `agent.streamEvents()` async generator and
 * transparently collects timing, token-usage and tool-call metrics from
 * the LangChain StreamEvent objects that flow through.
 *
 * Usage:
 *   const collector = new MetricsCollector();
 *   for await (const event of collector.wrap(agent.streamEvents({ prompt }))) {
 *     // render as before – events pass through unchanged
 *   }
 *   const trace = collector.finalise();   // structured SessionTrace
 */

import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import type {
	LLMCallMetrics,
	LLMCallTokens,
	SessionSummary,
	SessionTrace,
	ToolCallMetrics,
} from './types.ts';

// ── Internal bookkeeping for in-flight calls ──────────────────────────────

interface InflightLLMCall {
	callIndex: number;
	model?: string;
	startMs: number;
	firstTokenMs: number | null;
	tokens: LLMCallTokens;
}

interface InflightToolCall {
	callIndex: number;
	toolName: string;
	/** Stringified input for retry-detection heuristic. */
	inputKey: string;
	startMs: number;
}

export class MetricsCollector {
	// ── Completed metrics ────────────────────────────────────────────
	private readonly llmCalls: LLMCallMetrics[] = [];
	private readonly toolCalls: ToolCallMetrics[] = [];

	// ── In-flight tracking (keyed by run_id) ─────────────────────────
	private readonly inflightLLM = new Map<string, InflightLLMCall>();
	private readonly inflightTools = new Map<string, InflightToolCall>();

	// ── Counters ────────────────────────────────────────────────────
	private llmCallCounter = 0;
	private toolCallCounter = 0;

	// ── Retry detection ─────────────────────────────────────────────
	private lastToolKey: string | null = null;
	private retries = 0;

	// Track failure reasons per tool
	private readonly toolFailureReasons = new Map<string, Map<string, number>>();

	// ── Session boundary ────────────────────────────────────────────
	private sessionStartMs = 0;
	private sessionEndMs = 0;
	private started = false;

	/**
	 * Wrap an existing `streamEvents()` generator.
	 * Every yielded event is inspected, then forwarded unchanged.
	 */
	async *wrap(
		source: AsyncGenerator<StreamEvent, void, void>,
	): AsyncGenerator<StreamEvent, void, void> {
		this.sessionStartMs = Date.now();
		this.started = true;

		try {
			for await (const event of source) {
				this.process(event);
				yield event;
			}
		} finally {
			this.sessionEndMs = Date.now();
		}
	}

	// ── Event dispatcher ────────────────────────────────────────────

	private process(event: StreamEvent): void {
		switch (event.event) {
			case 'on_chat_model_start':
				this.onLLMStart(event);
				break;
			case 'on_chat_model_stream':
				this.onLLMStream(event);
				break;
			case 'on_chat_model_end':
				this.onLLMEnd(event);
				break;
			case 'on_tool_start':
				this.onToolStart(event);
				break;
			case 'on_tool_end':
				this.onToolEnd(event, true);
				break;
			case 'on_tool_error':
				this.onToolEnd(event, false);
				break;
		}
	}

	// ── LLM lifecycle ────────────────────────────────────────────────

	private onLLMStart(event: StreamEvent): void {
		const runId = event.run_id ?? `llm-${this.llmCallCounter}`;
		this.inflightLLM.set(runId, {
			callIndex: this.llmCallCounter++,
			model: event.name ?? undefined,
			startMs: Date.now(),
			firstTokenMs: null,
			tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		});
	}

	private onLLMStream(event: StreamEvent): void {
		const runId = event.run_id;
		if (!runId) return;
		const inflight = this.inflightLLM.get(runId);
		if (inflight && inflight.firstTokenMs === null) {
			inflight.firstTokenMs = Date.now();
		}
	}

	private onLLMEnd(event: StreamEvent): void {
		const runId = event.run_id;
		if (!runId) return;
		const inflight = this.inflightLLM.get(runId);
		if (!inflight) return;

		const endMs = Date.now();

		// Try to extract token usage from the AIMessage output.
		// LangChain providers attach usage_metadata on the AIMessage.
		const output = event.data?.output;
		const usage =
			output?.usage_metadata ??
			output?.response_metadata?.usage ??
			output?.response_metadata?.tokenUsage ??
			undefined;

		if (usage) {
			inflight.tokens = {
				promptTokens: usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokens ?? 0,
				completionTokens:
					usage.output_tokens ?? usage.completion_tokens ?? usage.completionTokens ?? 0,
				totalTokens:
					usage.total_tokens ??
					usage.totalTokens ??
					(usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
			};
		}

		this.llmCalls.push({
			callIndex: inflight.callIndex,
			model: inflight.model,
			latencyMs: endMs - inflight.startMs,
			ttftMs:
				inflight.firstTokenMs !== null ? inflight.firstTokenMs - inflight.startMs : null,
			tokens: inflight.tokens,
		});

		this.inflightLLM.delete(runId);
	}

	// ── Tool lifecycle ──────────────────────────────────────────────

	private onToolStart(event: StreamEvent): void {
		const runId = event.run_id ?? `tool-${this.toolCallCounter}`;
		const toolName = event.name ?? 'unknown';
		const inputKey = `${toolName}::${JSON.stringify(event.data?.input ?? {})}`;

		// Retry heuristic: same tool + same input back-to-back.
		if (this.lastToolKey !== null && inputKey === this.lastToolKey) {
			this.retries++;
		}
		this.lastToolKey = inputKey;

		this.inflightTools.set(runId, {
			callIndex: this.toolCallCounter++,
			toolName,
			inputKey,
			startMs: Date.now(),
		});
	}

	private onToolEnd(event: StreamEvent, success: boolean): void {
		const runId = event.run_id;
		if (!runId) return;
		const inflight = this.inflightTools.get(runId);
		if (!inflight) return;

		const endMs = Date.now();
		const metrics: ToolCallMetrics = {
			callIndex: inflight.callIndex,
			toolName: inflight.toolName,
			latencyMs: endMs - inflight.startMs,
			success,
		};

		if (!success) {
			const errorData = event.data as Record<string, unknown> | undefined;
			const errorField = errorData?.error;
			metrics.error =
				typeof errorField === 'string'
					? errorField
					: ((errorField as { message?: string } | undefined)?.message ??
						'Unknown error');

			// Increment failure reason counts
			const reason = metrics.error;
			let byReason = this.toolFailureReasons.get(inflight.toolName);
			if (!byReason) {
				byReason = new Map();
				this.toolFailureReasons.set(inflight.toolName, byReason);
			}
			byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
		}

		this.toolCalls.push(metrics);
		this.inflightTools.delete(runId);
	}

	public getToolFailureStats(): Record<string, Record<string, number>> {
		const out: Record<string, Record<string, number>> = {};
		for (const [tool, map] of this.toolFailureReasons) {
			out[tool] = {};
			for (const [reason, count] of map) out[tool][reason] = count;
		}
		return out;
	}

	// ── Produce the final structured trace ───────────────────────────

	/**
	 * Call after the wrapped generator has been fully consumed.
	 * Returns the complete, immutable session trace.
	 */
	finalise(): SessionTrace {
		const endMs = this.sessionEndMs || Date.now();
		const totalDurationMs = endMs - this.sessionStartMs;

		// Token aggregates
		let totalPromptTokens = 0;
		let totalCompletionTokens = 0;
		let totalTokens = 0;
		const promptTokenGrowth: number[] = [];

		for (const call of this.llmCalls) {
			totalPromptTokens += call.tokens.promptTokens;
			totalCompletionTokens += call.tokens.completionTokens;
			totalTokens += call.tokens.totalTokens;
			promptTokenGrowth.push(call.tokens.promptTokens);
		}

		// LLM latency
		const llmLatencies = this.llmCalls.map((c) => c.latencyMs);
		const avgLLMLatencyMs =
			llmLatencies.length > 0
				? llmLatencies.reduce((a, b) => a + b, 0) / llmLatencies.length
				: 0;

		// TTFT
		const ttfts = this.llmCalls.map((c) => c.ttftMs).filter((t): t is number => t !== null);
		const avgTTFTMs = ttfts.length > 0 ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length : null;

		// Tool aggregates
		const toolSuccessCount = this.toolCalls.filter((t) => t.success).length;
		const toolFailureCount = this.toolCalls.filter((t) => !t.success).length;
		const toolLatencies = this.toolCalls.map((t) => t.latencyMs);
		const avgToolLatencyMs =
			toolLatencies.length > 0
				? toolLatencies.reduce((a, b) => a + b, 0) / toolLatencies.length
				: 0;

		const summary: SessionSummary = {
			totalDurationMs,
			totalPromptTokens,
			totalCompletionTokens,
			totalTokens,
			promptTokenGrowth,
			llmCallCount: this.llmCalls.length,
			avgLLMLatencyMs: Math.round(avgLLMLatencyMs),
			avgTTFTMs: avgTTFTMs !== null ? Math.round(avgTTFTMs) : null,
			toolCallCount: this.toolCalls.length,
			toolSuccessCount,
			toolFailureCount,
			toolSuccessRate:
				this.toolCalls.length > 0 ? toolSuccessCount / this.toolCalls.length : 1,
			avgToolLatencyMs: Math.round(avgToolLatencyMs),
			estimatedRetries: this.retries,
		};

		return {
			startedAt: new Date(this.sessionStartMs).toISOString(),
			endedAt: new Date(endMs).toISOString(),
			llmCalls: [...this.llmCalls],
			toolCalls: [...this.toolCalls],
			toolFailureStats: this.getToolFailureStats(),
			summary,
		};
	}

	/** Whether `wrap()` has been called. */
	get isStarted(): boolean {
		return this.started;
	}
}
