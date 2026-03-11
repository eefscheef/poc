import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogle } from '@langchain/google';

export type LLMInstance = ChatOpenAI | ChatAnthropic | ChatGoogle;

export type ProviderName = 'openai' | 'anthropic' | 'google';

export interface LLMConfig {
	provider: ProviderName;
	apiKey: string;
	model: string;
	temperature?: number;
	maxOutputTokens?: number;
	baseUrl?: string;
}

export function createLLM(config: LLMConfig): LLMInstance {
	const temperature = config.temperature ?? 1.0;
	const maxOutputTokens = config.maxOutputTokens ?? 16_384;

	switch (config.provider) {
		case 'openai':
			return new ChatOpenAI({
				apiKey: config.apiKey,
				model: config.model,
				temperature,
				maxTokens: maxOutputTokens,
				...(config.baseUrl && {
					configuration: { baseURL: config.baseUrl },
				}),
			});

		case 'anthropic':
			return new ChatAnthropic({
				apiKey: config.apiKey,
				model: config.model,
				temperature,
				maxTokens: maxOutputTokens,
			});

		case 'google':
			return new ChatGoogle({
				apiKey: config.apiKey,
				model: config.model,
				temperature,
				maxOutputTokens,
			});

		default:
			throw new Error(`Unsupported provider: ${config.provider}`);
	}
}
