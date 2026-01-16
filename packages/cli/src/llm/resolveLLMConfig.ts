import { LLMConfig, ProviderName } from './providers.js';

const PROVIDERS: Record<
	ProviderName,
	{
		apiKeyEnv: string;
		modelEnv: string;
	}
> = {
	openai: {
		apiKeyEnv: 'OPENAI_API_KEY',
		modelEnv: 'OPENAI_MODEL',
	},
	anthropic: {
		apiKeyEnv: 'ANTHROPIC_API_KEY',
		modelEnv: 'ANTHROPIC_MODEL',
	},
	google: {
		apiKeyEnv: 'GOOGLE_API_KEY',
		modelEnv: 'GOOGLE_MODEL',
	},
};

export function resolveLLMConfig(
	providerOverride?: ProviderName,
	modelOverride?: string,
): LLMConfig {
	const providers = providerOverride
		? [providerOverride]
		: (Object.keys(PROVIDERS) as ProviderName[]);

	for (const provider of providers) {
		const env = PROVIDERS[provider];
		const apiKey = process.env[env.apiKeyEnv];
		if (!apiKey) continue;

		const model = modelOverride || process.env[env.modelEnv];
		if (!model) {
			throw new Error(`${env.modelEnv} must be set`);
		}

		return {
			provider,
			apiKey,
			model,
			baseUrl: provider === 'openai' ? process.env.OPENAI_BASE_URL : undefined,
		};
	}

	throw new Error('No matching LLM provider configuration found');
}
