import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export type LLMInstance = ChatOpenAI | ChatAnthropic | ChatGoogleGenerativeAI;

export type ProviderName = 'openai' | 'anthropic' | 'google';

export interface LLMConfig {
	provider: ProviderName;
	apiKey: string;
	model: string;
	temperature?: number;
	baseUrl?: string;
}

export function createLLM(config: LLMConfig): LLMInstance {
	const temperature = config.temperature ?? 0.2;

	switch (config.provider) {
		case 'openai':
			return new ChatOpenAI({
				apiKey: config.apiKey,
				model: config.model,
				temperature,
				...(config.baseUrl && {
					configuration: { baseURL: config.baseUrl },
				}),
			});

		case 'anthropic':
			return new ChatAnthropic({
				apiKey: config.apiKey,
				model: config.model,
				temperature,
			});

		case 'google':
			return new ChatGoogleGenerativeAI({
				apiKey: config.apiKey,
				model: config.model,
				temperature,
			});

		default:
			throw new Error(`Unsupported provider: ${config.provider}`);
	}
}
