/**
 * Express backend server for Ollama AI suggestions
 * 
 * This server acts as a proxy to Ollama (local LLM) to generate AI suggestions
 * for headcount planning scenarios.
 * 
 * Prerequisites:
 * 1. Install Ollama: https://ollama.ai
 * 2. Pull a model: ollama pull llama3.2 (or any other model)
 * 3. Run this server: npm run dev:server
 * 
 * The server will call Ollama at http://localhost:11434
 */

import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3000
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2'

// Middleware
app.use(cors())
app.use(express.json())

/**
 * POST /api/review-plan
 * 
 * Receives scenario data from frontend and returns AI-generated suggestions
 * using Ollama local LLM
 */
app.post('/api/review-plan', async (req, res) => {
  try {
    const { scenario, burnResult, runway } = req.body

    if (!scenario || !burnResult || !runway) {
      return res.status(400).json({
        error: 'Missing required fields: scenario, burnResult, or runway',
      })
    }

    // Format the prompt for the AI model
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

    const prompt = `You are a startup finance advisor helping founders with headcount planning.

Review this hiring plan and provide:
1. A brief 2-3 sentence summary of the plan
2. 3 specific risks to watch out for
3. 3 actionable suggestions for improvement

Return ONLY valid JSON (no backticks, no extra text) with this exact shape:
{"summary":"...","risks":["...", "...", "..."],"suggestions":["...", "...", "..."]}

Scenario: ${scenario.name}
Starting Cash: $${scenario.startingCash.toLocaleString()}
Projection Period: ${scenario.projectionMonths} months

Hiring Timeline:
${hasAnyHires ? hiresText : 'No hires planned'}

Non-Headcount Costs (total over projection): $${Math.round(summary.totalNonHeadcountCost).toLocaleString()}
Average Monthly Burn: $${Math.round(summary.averageMonthlyBurn).toLocaleString()}
${runway.hasRunwayEnd ? `Cash runs out in month ${runway.runwayMonths}` : `Projected ending cash: $${Math.round(runway.endingCash).toLocaleString()}`}`

    // Call Ollama API
    console.log(`🔄 Calling Ollama (${OLLAMA_MODEL})...`)
    
    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 500,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        console.error(`❌ Ollama API error (${response.status}):`, errorText)
        
        if (response.status === 404) {
          return res.status(500).json({
            error: `Ollama model "${OLLAMA_MODEL}" not found. Please run: ollama pull ${OLLAMA_MODEL}`,
          })
        }
        
        return res.status(500).json({
          error: `Ollama API returned ${response.status}. Make sure Ollama is running: ollama serve`,
        })
      }

      const data = await response.json()
      
      if (!data.response) {
        return res.status(500).json({
          error: 'Unexpected response format from Ollama',
        })
      }

      // Extract the generated text
      let generatedText = data.response.trim()

      // Clean the response - remove the original prompt if Ollama echoed it
      const cleanedText = generatedText.replace(prompt, '').trim()

      // Try to parse as JSON
      function extractJsonObject(text) {
        // First, try to find a complete JSON object
        const start = text.indexOf('{')
        const end = text.lastIndexOf('}')
        if (start === -1 || end === -1 || end <= start) return null
        
        let candidate = text.slice(start, end + 1)
        
        // Try direct parsing first
        try {
          return JSON.parse(candidate)
        } catch {
          // If that fails, try to fix common JSON issues
          // Remove trailing commas
          candidate = candidate.replace(/,(\s*[}\]])/g, '$1')
          try {
            return JSON.parse(candidate)
          } catch {
            // Try to extract just the JSON part more carefully
            // Look for balanced braces
            let depth = 0
            let jsonStart = -1
            let jsonEnd = -1
            for (let i = start; i <= end; i++) {
              if (text[i] === '{') {
                if (depth === 0) jsonStart = i
                depth++
              } else if (text[i] === '}') {
                depth--
                if (depth === 0) {
                  jsonEnd = i
                  break
                }
              }
            }
            if (jsonStart !== -1 && jsonEnd !== -1) {
              candidate = text.slice(jsonStart, jsonEnd + 1).replace(/,(\s*[}\]])/g, '$1')
              try {
                return JSON.parse(candidate)
              } catch {
                return null
              }
            }
            return null
          }
        }
      }

      const parsed = extractJsonObject(cleanedText)
      
      // Debug: log what we got if parsing failed
      if (!parsed) {
        console.log(`📝 Raw response preview (first 500 chars):`, cleanedText.substring(0, 500))
      }

      if (parsed?.summary && Array.isArray(parsed?.suggestions)) {
        // Return structured response
        console.log(`✅ Successfully got response from Ollama`)
        
        // Clean the summary - extract just the summary text, not the whole JSON
        let cleanSummary = String(parsed.summary).trim()
        
        // If summary contains the entire JSON object as a string, extract just the summary part
        if (cleanSummary.includes('"summary"') && (cleanSummary.includes('"risks"') || cleanSummary.includes('"suggestions"'))) {
          // Try to parse it as JSON again to extract just the summary field
          try {
            const nestedParsed = JSON.parse(cleanSummary)
            if (nestedParsed && typeof nestedParsed.summary === 'string') {
              cleanSummary = nestedParsed.summary
            } else {
              // If nested parsing didn't work, try regex extraction
              const summaryMatch = cleanSummary.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/)
              if (summaryMatch && summaryMatch[1]) {
                cleanSummary = summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\')
              }
            }
          } catch {
            // If that fails, try to extract the summary value manually with regex
            const summaryMatch = cleanSummary.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/)
            if (summaryMatch && summaryMatch[1]) {
              cleanSummary = summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\')
            }
          }
        }
        
        // Remove JSON stringification artifacts (quotes around the string)
        if (cleanSummary.startsWith('"') && cleanSummary.endsWith('"') && cleanSummary.length > 2) {
          try {
            cleanSummary = JSON.parse(cleanSummary)
          } catch {
            // If parsing fails, just remove the outer quotes
            cleanSummary = cleanSummary.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\')
          }
        }
        
        // Clean up escaped characters and normalize whitespace
        cleanSummary = cleanSummary
          .replace(/\\n/g, ' ')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\s+/g, ' ')
          .trim()
        
        return res.json({
          summary: cleanSummary,
          risks: Array.isArray(parsed.risks)
            ? parsed.risks.map((r) => {
                let risk = String(r).trim()
                // Clean up if it's JSON-encoded
                if (risk.startsWith('"') && risk.endsWith('"')) {
                  try {
                    risk = JSON.parse(risk)
                  } catch {
                    risk = risk.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, ' ')
                  }
                }
                return risk.replace(/\\n/g, ' ').trim()
              }).filter(Boolean).slice(0, 3)
            : [],
          suggestions: parsed.suggestions
            .map((s) => {
              let suggestion = String(s).trim()
              // Clean up if it's JSON-encoded
              if (suggestion.startsWith('"') && suggestion.endsWith('"')) {
                try {
                  suggestion = JSON.parse(suggestion)
                } catch {
                  suggestion = suggestion.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, ' ')
                }
              }
              return suggestion.replace(/\\n/g, ' ').trim()
            })
            .filter(Boolean)
            .slice(0, 3),
        })
      }

      // Fallback: if JSON parsing failed, try to extract structured data from text
      console.log(`⚠️  Could not parse JSON from Ollama, attempting text extraction`)
      
      // Try to extract summary, risks, and suggestions using regex patterns
      let fallbackSummary = cleanedText.split('\n').slice(0, 3).join(' ').trim() || 'AI analysis generated.'
      const fallbackRisks = []
      const fallbackSuggestions = []
      
      // Try to find "risks" section
      const risksMatch = cleanedText.match(/risks?[:\-]?\s*(?:\n|\[|")(.*?)(?:\n\n|suggestions?|$)/is)
      if (risksMatch) {
        const risksText = risksMatch[1]
        // Try to extract list items (numbered, bulleted, or quoted)
        const riskItems = risksText.match(/(?:^|\n)[\s\-*•]*(?:\d+\.\s*)?["']?([^"'\n]+)["']?/gim)
        if (riskItems) {
          riskItems.slice(0, 3).forEach(item => {
            const cleaned = item.replace(/^[\s\-*•\d."']+/, '').trim()
            if (cleaned) fallbackRisks.push(cleaned)
          })
        }
      }
      
      // Try to find "suggestions" section
      const suggestionsMatch = cleanedText.match(/suggestions?[:\-]?\s*(?:\n|\[|")(.*?)$/is)
      if (suggestionsMatch) {
        const suggestionsText = suggestionsMatch[1]
        // Try to extract list items (numbered, bulleted, or quoted)
        const suggestionItems = suggestionsText.match(/(?:^|\n)[\s\-*•]*(?:\d+\.\s*)?["']?([^"'\n]+)["']?/gim)
        if (suggestionItems) {
          suggestionItems.slice(0, 3).forEach(item => {
            const cleaned = item.replace(/^[\s\-*•\d."']+/, '').trim()
            if (cleaned) fallbackSuggestions.push(cleaned)
          })
        }
      }
      
      // If we still don't have risks/suggestions, try to extract from JSON-like structure in text
      if (fallbackRisks.length === 0) {
        const risksArrayMatch = cleanedText.match(/"risks?"\s*:\s*\[(.*?)\]/is)
        if (risksArrayMatch) {
          const risksArrayText = risksArrayMatch[1]
          const riskQuotes = risksArrayText.match(/"([^"]+)"/g)
          if (riskQuotes) {
            riskQuotes.slice(0, 3).forEach(quote => {
              const cleaned = quote.replace(/^"|"$/g, '').trim()
              if (cleaned) fallbackRisks.push(cleaned)
            })
          }
        }
      }
      
      if (fallbackSuggestions.length === 0) {
        const suggestionsArrayMatch = cleanedText.match(/"suggestions?"\s*:\s*\[(.*?)\]/is)
        if (suggestionsArrayMatch) {
          const suggestionsArrayText = suggestionsArrayMatch[1]
          const suggestionQuotes = suggestionsArrayText.match(/"([^"]+)"/g)
          if (suggestionQuotes) {
            suggestionQuotes.slice(0, 3).forEach(quote => {
              const cleaned = quote.replace(/^"|"$/g, '').trim()
              if (cleaned) fallbackSuggestions.push(cleaned)
            })
          }
        }
      }
      
      return res.json({
        summary: fallbackSummary,
        risks: fallbackRisks.slice(0, 3),
        suggestions: fallbackSuggestions.slice(0, 3),
      })
    } catch (fetchError) {
      console.error('❌ Error calling Ollama:', fetchError.message)
      
      if (fetchError.code === 'ECONNREFUSED') {
        return res.status(500).json({
          error: 'Cannot connect to Ollama. Make sure Ollama is running: ollama serve',
        })
      }
      
      throw fetchError
    }
  } catch (error) {
    console.error('Error in /api/review-plan:', error)
    return res.status(500).json({
      error: error.message || 'Internal server error',
    })
  }
})

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    ollama_url: OLLAMA_URL,
    ollama_model: OLLAMA_MODEL,
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`)
  console.log(`🤖 Ollama URL: ${OLLAMA_URL}`)
  console.log(`📦 Ollama Model: ${OLLAMA_MODEL}`)
  console.log(`\n💡 Make sure Ollama is running: ollama serve`)
  console.log(`💡 Pull a model if needed: ollama pull ${OLLAMA_MODEL}`)
})
