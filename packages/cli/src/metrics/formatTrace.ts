import chalk from 'chalk';
import type { SessionTrace } from './types.ts';

/**
 * Format a SessionTrace as a human-readable summary for terminal output.
 */
export function formatTraceText(trace: SessionTrace): string {
	const { summary: s } = trace;
	const lines: string[] = [];

	lines.push('');
	lines.push(chalk.bold.cyan('──── Session Metrics ────────────────────────────────────'));
	lines.push('');

	// ── Timing ───────────────────────────────────────────
	lines.push(chalk.bold('Timing'));
	lines.push(`  Total duration        ${fmtMs(s.totalDurationMs)}`);
	lines.push(`  Avg LLM latency       ${fmtMs(s.avgLLMLatencyMs)}`);
	lines.push(
		`  Avg TTFT              ${s.avgTTFTMs !== null ? fmtMs(s.avgTTFTMs) : chalk.dim('n/a')}`,
	);
	lines.push(`  Avg tool latency      ${fmtMs(s.avgToolLatencyMs)}`);
	lines.push('');

	// ── Tokens ───────────────────────────────────────────
	lines.push(chalk.bold('Tokens'));
	lines.push(`  Prompt tokens         ${s.totalPromptTokens.toLocaleString()}`);
	lines.push(`  Completion tokens     ${s.totalCompletionTokens.toLocaleString()}`);
	lines.push(`  Total tokens          ${s.totalTokens.toLocaleString()}`);

	if (s.promptTokenGrowth.length > 1) {
		const growth = s.promptTokenGrowth.map((t) => t.toLocaleString()).join(' → ');
		lines.push(`  Prompt growth/step    ${growth}`);
	}
	lines.push('');

	// ── LLM Calls ────────────────────────────────────────
	lines.push(chalk.bold('LLM Calls'));
	lines.push(`  Count                 ${s.llmCallCount}`);

	if (trace.llmCalls.length > 0) {
		for (const call of trace.llmCalls) {
			const ttft = call.ttftMs !== null ? `TTFT ${fmtMs(call.ttftMs)}` : chalk.dim('no TTFT');
			lines.push(
				`    #${call.callIndex}  ${fmtMs(call.latencyMs)}  ${ttft}  ` +
					`in:${call.tokens.promptTokens} out:${call.tokens.completionTokens}`,
			);
		}
	}
	lines.push('');

	// ── Tool Calls ───────────────────────────────────────
	lines.push(chalk.bold('Tool Calls'));
	lines.push(`  Count                 ${s.toolCallCount}`);
	lines.push(
		s.toolCallCount > 0
			? `  Success rate          ${(s.toolSuccessRate * 100).toFixed(0)}%  ` +
					`(${s.toolSuccessCount} ok / ${s.toolFailureCount} failed)`
			: `  Success rate          ${chalk.dim('n/a')}  ` +
					`(${s.toolSuccessCount} ok / ${s.toolFailureCount} failed)`,
	);
	lines.push(`  Estimated retries     ${s.estimatedRetries}`);

	if (trace.toolCalls.length > 0) {
		for (const call of trace.toolCalls) {
			const status = call.success ? chalk.green('✓') : chalk.red('✗');
			const err = call.error ? `  ${chalk.red(call.error)}` : '';
			lines.push(
				`    #${call.callIndex}  ${status} ${call.toolName}  ${fmtMs(call.latencyMs)}${err}`,
			);
		}
	}

	const toolFailureTools = Object.keys(trace.toolFailureStats);
	if (toolFailureTools.length > 0) {
		lines.push('');
		lines.push(chalk.bold('Tool Failure Reasons'));
		for (const tool of toolFailureTools) {
			lines.push(`  ${tool}`);
			const byReason = trace.toolFailureStats[tool] ?? {};
			for (const [reason, count] of Object.entries(byReason)) {
				lines.push(`    ${count}x  ${chalk.red(reason)}`);
			}
		}
	}

	lines.push('');
	lines.push(chalk.bold.cyan('─────────────────────────────────────────────────────────'));
	lines.push('');

	return lines.join('\n');
}

/** Milliseconds → human string ("1234 ms" or "2.3 s"). */
function fmtMs(ms: number): string {
	if (ms < 1000) return `${ms} ms`;
	return `${(ms / 1000).toFixed(1)} s`;
}
