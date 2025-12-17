/**
 * Hugging Face Inference API utility
 * 
 * This uses the free Hugging Face Inference API to generate AI summaries
 * and suggestions for headcount planning scenarios.
 * 
 * To use this:
 * 1. Get a free API token from https://huggingface.co/settings/tokens
 * 2. Create a .env file in the project root with: VITE_HUGGINGFACE_API_KEY=your_token_here
 * 3. The token will be automatically used in API calls
 */

// Using a smaller, more reliable model that's always available on free tier
// Try direct call first (router endpoint may support CORS), fallback to proxy
const HUGGINGFACE_API_URL_DIRECT = 'https://router.huggingface.co/hf-inference/models/microsoft/Phi-3-mini-4k-instruct'
const HUGGINGFACE_API_URL_PROXY = '/api/huggingface/models/microsoft/Phi-3-mini-4k-instruct'
const API_KEY = import.meta.env.VITE_HUGGINGFACE_API_KEY

/**
 * Formats scenario data into a prompt for the AI model
 */
function formatScenarioPrompt(scenario, burnResult, runway) {
  const { summary } = burnResult
  const hiresByMonth = {}
  
  scenario.hires.forEach((hire) => {
    if (!hiresByMonth[hire.startMonth]) {
      hiresByMonth[hire.startMonth] = []
    }
    hiresByMonth[hire.startMonth].push(hire.title)
  })

  const hiresText = Object.entries(hiresByMonth)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([month, titles]) => `Month ${Number(month) + 1}: ${titles.join(', ')}`)
    .join('\n')

  const hasAnyHires = Object.keys(hiresByMonth).length > 0

  const prompt = `You are a startup advisor helping founders with headcount planning.
Return ONLY valid JSON (no backticks, no extra text) with this exact shape:
{"summary":"...","suggestions":["...", "...", "...", "..."]}

Rules:
- summary: 2-3 sentences max
- suggestions: 3-4 items, each specific and actionable

Scenario: ${scenario.name}
Starting Cash: $${scenario.startingCash.toLocaleString()}
Projection Period: ${scenario.projectionMonths} months

Hiring Timeline:
${hasAnyHires ? hiresText : 'No hires planned'}

Non-Headcount Costs (total over projection): $${Math.round(summary.totalNonHeadcountCost).toLocaleString()}
Average Monthly Burn: $${Math.round(summary.averageMonthlyBurn).toLocaleString()}
${runway.hasRunwayEnd ? `Cash runs out in month ${runway.runwayMonths}` : `Projected ending cash: $${Math.round(runway.endingCash).toLocaleString()}`}`

  return prompt
}

function extractJsonObject(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const candidate = text.slice(start, end + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

/**
 * Calls Hugging Face Inference API to generate AI insights
 */
export async function generateAIInsights(scenario, burnResult, runway) {
  // Debug: Check if API key is loaded (but don't log the actual key)
  if (!API_KEY) {
    console.error('API_KEY is missing. Check your .env file and restart the dev server.')
    throw new Error('Hugging Face API key not found. Please set VITE_HUGGINGFACE_API_KEY in your .env file and restart the dev server.')
  }

  const prompt = formatScenarioPrompt(scenario, burnResult, runway)

  try {
    // HF Inference API may respond 503 while the model spins up; retry a bit.
    let data = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response
      try {
        // Try direct call first (router endpoint may support CORS now)
        const headers = {
          'Content-Type': 'application/json',
        }
        
        // Always add API key - required for authentication
        if (!API_KEY) {
          throw new Error('API key is missing. Please set VITE_HUGGINGFACE_API_KEY in your .env file.')
        }
        headers['Authorization'] = `Bearer ${API_KEY}`
        
        // Try direct call to router endpoint
        response = await fetch(HUGGINGFACE_API_URL_DIRECT, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 350,
              temperature: 0.6,
              return_full_text: false,
            },
          }),
        })
      } catch (fetchError) {
        // Network error (CORS, connection failed, etc.)
        console.error('Fetch error:', fetchError)
        throw new Error(
          `Network error: ${fetchError.message}. This might be a CORS issue or the API endpoint is incorrect. Check the browser console for details.`
        )
      }

      if (response.status === 503) {
        const errorData = await response.json().catch(() => ({}))
        const waitSeconds =
          typeof errorData?.estimated_time === 'number'
            ? Math.ceil(errorData.estimated_time)
            : 2
        await new Promise((r) => setTimeout(r, Math.min(waitSeconds, 5) * 1000))
        continue
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || errorData.message || `API request failed with status ${response.status}`
        
        // Provide more helpful error messages
        if (response.status === 401) {
          throw new Error(
            `Authentication failed (401). Please check:\n` +
            `1. Your .env file has VITE_HUGGINGFACE_API_KEY=your_token_here\n` +
            `2. You restarted the dev server after creating/updating .env\n` +
            `3. Your Hugging Face token is valid and has the correct permissions\n\n` +
            `Original error: ${errorMessage}`
          )
        }
        
        throw new Error(errorMessage)
      }

      data = await response.json()
      break
    }

    if (!data) {
      throw new Error('Hugging Face model is still loading. Please try again in a moment.')
    }
    
    // Handle different response formats
    let generatedText = ''
    if (Array.isArray(data) && data[0]?.generated_text) {
      generatedText = data[0].generated_text
    } else if (data.generated_text) {
      generatedText = data.generated_text
    } else {
      throw new Error('Unexpected response format from API')
    }

    const parsed = extractJsonObject(generatedText)
    if (parsed?.summary && Array.isArray(parsed?.suggestions)) {
      return {
        summary: String(parsed.summary).trim(),
        suggestions: parsed.suggestions
          .map((s) => String(s).trim())
          .filter(Boolean)
          .slice(0, 4),
      }
    }

    // Fallback if the model didn't output JSON
    const fallbackSummary = generatedText.split('\n').slice(0, 3).join(' ').trim()
    return {
      summary: fallbackSummary || 'AI analysis generated successfully.',
      suggestions: [
        'Double-check whether your early hires align with near-term milestones.',
        'Revisit non-headcount costs to extend runway without slowing velocity.',
        'Model an alternative hiring cadence and compare runway sensitivity.',
      ],
    }
  } catch (error) {
    console.error('Error calling Hugging Face API:', error)
    // Provide more helpful error messages
    if (error.message.includes('Network error')) {
      throw error
    } else if (error.message) {
      throw error
    } else {
      throw new Error(`Failed to generate insights: ${error.message || 'Unknown error'}`)
    }
  }
}

