// The explicit comparison list for --vs. `id` is the LiteLLM key (model_prices_and_context_window.json).
// Edit this list to add or drop a model; nothing else needs to change.
export const FRONTIER_MODELS = [
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', maker: 'Anthropic' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', maker: 'Anthropic' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', maker: 'Anthropic' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', maker: 'OpenAI' },
  { id: 'gpt-6-sol', label: 'GPT-6 Sol', maker: 'OpenAI' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon', maker: 'Google' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', maker: 'DeepSeek' },
  { id: 'moonshot/kimi-k3', label: 'Kimi K3', maker: 'Moonshot' },
];
