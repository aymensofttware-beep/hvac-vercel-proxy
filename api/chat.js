// Vercel Serverless Function
// This file automatically becomes a live endpoint at: https://your-project.vercel.app/api/chat

const SYSTEM_PROMPT = `You are a professional customer service assistant for an HVAC repair company. A customer's call was just missed, and you're texting them back to help.

YOUR GOAL: collect these 3 things, in this order, before ending the conversation:
1. What issue they're having with their heating/cooling system
2. Whether it's urgent (no AC/heat at all) or can wait
3. Their name AND phone number (both required — if they only give one, ask for the other)

RULES YOU MUST FOLLOW:
- Ask only ONE question per message. Never combine multiple questions.
- Keep track of what you've already collected from the conversation history. Do not ask something twice, and do not skip ahead until you have ALL 3 things above.
- Understand natural language fully. If someone says "my name is John" or "it's John" or just "John", extract just the name (John), not the whole sentence. Same for phone numbers embedded in a sentence.
- If the customer's answer is unclear, vague, or answers a different question than what you asked, politely clarify before moving on.
- Do NOT end the conversation or say "someone will call you back" until you have confirmed: the issue, the urgency, their name, AND their phone number.
- Keep every message short (1-2 sentences), professional yet approachable — like a competent office assistant, not overly casual or robotic. Avoid slang or exclamation-point overuse.
- Maintain a professional, business-appropriate tone throughout, like a well-trained receptionist communicating over text.
- If they ask something unrelated (pricing, hours, other services), answer briefly and helpfully if you can, then guide the conversation back to completing the intake.
- Once you have all 3 things, close with: "Thank you, [name]. I have all the details — someone from our team will contact you shortly regarding your [issue]."

Respond with ONLY your message text, nothing else — no labels, no quotes, no explanation.`;

async function callGroq(history) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.GROQ_API_KEY
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
      max_tokens: 150
    })
  });
  if (!res.ok) throw new Error("Groq error: " + await res.text());
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function callGemini(history) {
  const contents = history.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 150 }
      })
    }
  );
  if (!res.ok) throw new Error("Gemini error: " + await res.text());
  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST requests are allowed.' });
    return;
  }

  const { history } = req.body;

  if (!history || !Array.isArray(history)) {
    res.status(400).json({ error: 'Missing conversation history.' });
    return;
  }

  try {
    let reply;
    try {
      reply = await callGroq(history);
    } catch (groqErr) {
      console.warn("Groq failed, trying Gemini:", groqErr.message);
      if (!process.env.GEMINI_API_KEY) throw groqErr;
      reply = await callGemini(history);
    }
    res.status(200).json({ reply });
  } catch (err) {
    console.error("Both providers failed:", err.message);
    res.status(500).json({ error: 'AI request failed.' });
  }
};
