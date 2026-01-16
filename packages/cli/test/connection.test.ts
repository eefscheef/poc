import { test, describe } from 'node:test';
import assert from 'node:assert';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolveLLMConfig } from '../src/llm/resolveLLMConfig.js';
import { createLLM } from '../src/llm/providers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the CLI package root
config({ path: join(__dirname, '..', '.env') });

describe('LLM Connection Tests', () => {
	test('environment should have API key configured', () => {
		const hasOpenAI = !!process.env.OPENAI_API_KEY;
		const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
		const hasGemini = !!process.env.GOOGLE_API_KEY;

		assert.ok(
			hasOpenAI || hasAnthropic || hasGemini,
			'Either OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY must be set in .env file',
		);
	});

	test('environment should have model configured', () => {
		const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
		const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
		const hasGeminiKey = !!process.env.GOOGLE_API_KEY;

		if (hasOpenAIKey) {
			assert.ok(process.env.OPENAI_MODEL, 'OPENAI_MODEL must be set when using OpenAI');
		}

		if (hasAnthropicKey && !hasOpenAIKey) {
			assert.ok(
				process.env.ANTHROPIC_MODEL,
				'ANTHROPIC_MODEL must be set when using Anthropic',
			);
		}

		if (hasGeminiKey && !hasOpenAIKey && !hasAnthropicKey) {
			assert.ok(process.env.GOOGLE_MODEL, 'GOOGLE_MODEL must be set when using Gemini');
		}
	});

	test('should resolve LLM config for OpenAI', { skip: !process.env.OPENAI_API_KEY }, () => {
		const config = resolveLLMConfig('openai');

		assert.strictEqual(config.provider, 'openai');
		assert.ok(config.apiKey, 'API key should be present');
		assert.ok(config.model, 'Model should be present');
	});

	test(
		'should resolve LLM config for Anthropic',
		{ skip: !process.env.ANTHROPIC_API_KEY },
		() => {
			const config = resolveLLMConfig('anthropic');

			assert.strictEqual(config.provider, 'anthropic');
			assert.ok(config.apiKey, 'API key should be present');
			assert.ok(config.model, 'Model should be present');
		},
	);

	test('should resolve LLM config for Google', { skip: !process.env.GOOGLE_API_KEY }, () => {
		const config = resolveLLMConfig('google');

		assert.strictEqual(config.provider, 'google');
		assert.ok(config.apiKey, 'API key should be present');
		assert.ok(config.model, 'Model should be present');
	});

	test('should resolve LLM config automatically', () => {
		const config = resolveLLMConfig();

		assert.ok(config.provider, 'Provider should be resolved');
		assert.ok(config.apiKey, 'API key should be present');
		assert.ok(config.model, 'Model should be present');
	});

	test('should create OpenAI LLM instance', { skip: !process.env.OPENAI_API_KEY }, () => {
		const config = resolveLLMConfig('openai');
		const llm = createLLM(config);

		assert.ok(llm, 'Failed to create OpenAI LLM instance');
	});

	test('should create Anthropic LLM instance', { skip: !process.env.ANTHROPIC_API_KEY }, () => {
		const config = resolveLLMConfig('anthropic');
		const llm = createLLM(config);

		assert.ok(llm, 'Failed to create Anthropic LLM instance');
	});

	test('should create Gemini LLM instance', { skip: !process.env.GOOGLE_API_KEY }, () => {
		const config = resolveLLMConfig('google');
		const llm = createLLM(config);

		assert.ok(llm, 'Failed to create Gemini LLM instance');
	});

	test(
		'should connect to LLM and get response',
		{
			skip:
				!process.env.RUN_LIVE_TESTS ||
				(!process.env.OPENAI_API_KEY &&
					!process.env.ANTHROPIC_API_KEY &&
					!process.env.GOOGLE_API_KEY),
		},
		async () => {
			const config = resolveLLMConfig();
			const llm = createLLM(config);

			// Simple test to verify connection
			const response = await llm.invoke('Say "OK" if you can read this.');

			assert.ok(response, 'Failed to get response from LLM');
			assert.ok(response.content, 'Response has no content');
			console.log('  ✓ LLM Response:', response.content);
		},
	);
});
