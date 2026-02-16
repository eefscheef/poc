/**
 * Types for structured session trace and metrics collection.
 *
 * All durations are in milliseconds.
 */

/** Token counts for a single LLM call. */
export interface LLMCallTokens {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

/** Metrics for a single LLM invocation within the session. */
export interface LLMCallMetrics {
	/** Sequential call index (0-based). */
	callIndex: number;
	/** Model name reported by the event, if available. */
	model?: string;
	/** Wall-clock latency of the full LLM call (start → end). */
	latencyMs: number;
	/** Time to first streamed token (start → first on_chat_model_stream). */
	ttftMs: number | null;
	/** Token usage as reported by the provider. */
	tokens: LLMCallTokens;
}

/** Metrics for a single MCP tool invocation. */
export interface ToolCallMetrics {
	/** Sequential call index across the whole session (0-based). */
	callIndex: number;
	/** The tool name from the event. */
	toolName: string;
	/** Wall-clock latency. */
	latencyMs: number;
	/** Whether the call succeeded. */
	success: boolean;
	/** Error message when `success === false`. */
	error?: string;
}

/** Aggregated summary for the entire session / task. */
export interface SessionSummary {
	/** Total wall-clock time for the task. */
	totalDurationMs: number;

	// ── Token metrics ────────────────────────────────────────────────
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalTokens: number;

	/** Per-LLM-call input-token counts – useful for detecting prompt bloat. */
	promptTokenGrowth: number[];

	// ── LLM call metrics ─────────────────────────────────────────────
	llmCallCount: number;
	/** Average LLM call latency. */
	avgLLMLatencyMs: number;
	/** Average time-to-first-token (only over calls where TTFT was measured). */
	avgTTFTMs: number | null;

	// ── Tool call metrics ────────────────────────────────────────────
	toolCallCount: number;
	toolSuccessCount: number;
	toolFailureCount: number;
	toolSuccessRate: number;
	/** Average tool call latency. */
	avgToolLatencyMs: number;

	// ── Retry detection ──────────────────────────────────────────────
	/**
	 * Number of back-to-back duplicate tool calls (same tool name + input).
	 * This is a heuristic for retry behaviour.
	 */
	estimatedRetries: number;
}
/** The full structured trace for one agent session / task. */
export interface SessionTrace {
	startedAt: string;
	endedAt: string;
	llmCalls: LLMCallMetrics[];
	toolCalls: ToolCallMetrics[];
	toolFailureStats: Record<string, Record<string, number>>;
	summary: SessionSummary;
}

export interface SessionTrace {
	/** ISO-8601 timestamp when the session started. */
	startedAt: string;
	/** ISO-8601 timestamp when the session ended. */
	endedAt: string;
	/** Ordered list of every LLM call in the session. */
	llmCalls: LLMCallMetrics[];
	/** Ordered list of every tool call in the session. */
	toolCalls: ToolCallMetrics[];
	/** Aggregated summary. */
	summary: SessionSummary;
}
