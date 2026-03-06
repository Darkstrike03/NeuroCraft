/**
 * Direct browser → LLM API calls (OpenRouter or any OpenAI-compatible endpoint).
 * OpenRouter supports CORS so this works from any browser tab with no proxy.
 */
export async function callLLM({ apiKey, baseUrl, model, messages, maxTokens = 250 }) {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization':  `Bearer ${apiKey}`,
      'Content-Type':   'application/json',
      'HTTP-Referer':   location.origin,
      'X-Title':        'NeuroCraft',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens:  maxTokens,
      temperature: 0.85,
    }),
  });

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { const e = await resp.json(); msg = e.error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from LLM');
  return content.trim();
}
