export async function callAI(settings, prompt, maxTokens = 4096) {
  const apiKey = settings.geminiApiKey?.trim()
  if (!apiKey) throw new Error('No Gemini API key. Go to Settings → AI Configuration and add your free key from aistudio.google.com.')
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
    }
  )
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `Gemini error ${r.status}`) }
  const data = await r.json()

  // A 200 OK response can still carry no usable text at all — a safety
  // filter tripped on the prompt or the response, or generation stopped
  // before writing anything. Silently returning '' used to look identical
  // to a normal call that just happened to generate nothing, so callers
  // (BulkGenerator especially) would go on to save/publish an empty post as
  // if the generation had actually worked.
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked this prompt (${data.promptFeedback.blockReason}). Try rephrasing the topic.`)
  }
  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text || ''
  if (!text) {
    const reason = candidate?.finishReason
    throw new Error(reason ? `Gemini returned no content (${reason}).` : 'Gemini returned no content.')
  }
  return text
}
