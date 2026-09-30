// Manual prices for listed models that LiteLLM does not carry yet. Used ONLY when LiteLLM has no entry for the id,
// so live data wins the day LiteLLM adds the model. All prices are USD per million tokens.
//
// A missing cacheWrite is deliberate: Google lists no cache-write premium, so reprice.js bills writes at the input
// rate and records that in `filled` (an assumption, not a published price).
export const PRICE_OVERRIDES = {
  'gemini-4-argon': {
    intro: { input: 2, output: 10, cacheRead: 0.10 },   // cached input is 95% off the input price
    after: { input: 4, output: 20, cacheRead: 0.20 },   // standard price once the introductory period ends
    sourceUrl: 'https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/',
    sourceName: 'blog.google',
    checked: '2026-09-30',
    note: 'introductory price',
    assumption: 'Google lists no cache-write premium, so cache writes are priced at the input rate.',
  },
};
