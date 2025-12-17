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
          // First, fix the specific malformed pattern where risks array ends with "} instead of ]
          // Pattern: "risks":["item1","item2","item3"} -> "risks":["item1","item2","item3"]
          candidate = candidate.replace(/"risks"\s*:\s*\[([^\]]*)"\s*}/g, (match, risksContent) => {
            // Extract all the risk items
            const riskItems = risksContent.match(/"([^"]+)"/g) || []
            if (riskItems.length > 0) {
              return `"risks":[${riskItems.join(',')}]`
            }
            return match
          })
          
          // Fix similar pattern for suggestions if it exists
          candidate = candidate.replace(/"suggestions"\s*:\s*\[([^\]]*)"\s*}/g, (match, suggestionsContent) => {
            // Extract all the suggestion items (could be strings or objects)
            const suggestionItems = suggestionsContent.match(/"([^"]+)"/g) || []
            if (suggestionItems.length > 0) {
              return `"suggestions":[${suggestionItems.join(',')}]`
            }
            return match
          })
          
          // Also fix the pattern: "item","} -> "item"]
          candidate = candidate.replace(/"\s*,\s*"\s*}\s*,\s*\{/g, '"]')
          candidate = candidate.replace(/"\s*,\s*"\s*}/g, '"]')
          
          // Remove trailing commas in arrays and objects
          candidate = candidate.replace(/,(\s*[}\]])/g, '$1')
          
          // Remove any second JSON object that might have been started
          // Look for patterns like: }, {"suggestions"
          const secondObjectMatch = candidate.match(/}\s*,\s*\{/)
          if (secondObjectMatch) {
            // Extract only the first complete object
            const firstObjectEnd = candidate.indexOf('}')
            if (firstObjectEnd !== -1) {
              candidate = candidate.slice(0, firstObjectEnd + 1)
            }
          }
          
          // Also handle cases where the risks array is malformed but suggestions might be extractable
          // Pattern: "risks":["item1","item2","item3","}, {"suggestions":["sug1","sug2"
          // We want to close the risks array properly and extract suggestions separately if needed
          const malformedRisksMatch = candidate.match(/"risks"\s*:\s*\[(.*?)\],?\s*"\s*},?\s*\{/)
          if (malformedRisksMatch) {
            // Try to extract valid risks before the malformed ending
            const risksText = malformedRisksMatch[1]
            const validRisks = risksText.match(/"([^"]+)"/g) || []
            if (validRisks.length > 0) {
              // Reconstruct with proper closing
              const risksArray = '[' + validRisks.join(',') + ']'
              candidate = candidate.replace(/"risks"\s*:\s*\[.*?\],?\s*"\s*},?\s*\{/, `"risks":${risksArray},"suggestions":[`)
            }
          }
          
          try {
            return JSON.parse(candidate)
          } catch {
            // Try to extract just the JSON part more carefully
            // Look for balanced braces
            let depth = 0
            let jsonStart = -1
            let jsonEnd = -1
            for (let i = start; i <= end && i < text.length; i++) {
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
              candidate = text.slice(jsonStart, jsonEnd + 1)
                .replace(/,(\s*[}\]])/g, '$1')
                .replace(/"\s*,\s*"\s*}/g, '"]')
                .replace(/"\s*,\s*}\s*{/g, '"]')
              
              // Remove any second object attempt
              const secondObj = candidate.indexOf('}, {')
              if (secondObj !== -1) {
                candidate = candidate.slice(0, secondObj + 1)
              }
              
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

      // Validate parsed structure
      const hasValidSummary = parsed?.summary && typeof parsed.summary === 'string'
      const hasValidRisks = Array.isArray(parsed?.risks)
      const hasValidSuggestions = Array.isArray(parsed?.suggestions)
      
      if (hasValidSummary && (hasValidRisks || hasValidSuggestions)) {
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
        
        // Safely extract risks
        let cleanRisks = []
        if (hasValidRisks && parsed.risks.length > 0) {
          cleanRisks = parsed.risks
            .map((r) => {
              if (typeof r !== 'string') {
                const str = String(r).trim()
                return str && str.length > 0 && !str.match(/^[:\[\]]+$/) ? str : null
              }
              let risk = r.trim()
              // Skip invalid entries
              if (!risk || risk.length === 0 || risk.match(/^[:\[\]]+$/)) {
                return null
              }
              // Clean up if it's JSON-encoded
              if (risk.startsWith('"') && risk.endsWith('"')) {
                try {
                  risk = JSON.parse(risk)
                } catch {
                  risk = risk.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, ' ')
                }
              }
              const cleaned = risk.replace(/\\n/g, ' ').trim()
              return cleaned && cleaned.length > 0 && !cleaned.match(/^[:\[\]]+$/) ? cleaned : null
            })
            .filter((r) => r !== null && r !== undefined)
            .slice(0, 3)
        }
        
        // Safely extract suggestions
        let cleanSuggestions = []
        if (hasValidSuggestions && parsed.suggestions.length > 0) {
          cleanSuggestions = parsed.suggestions
            .map((s) => {
              // Handle objects (e.g., {"type":"..."})
              if (typeof s === 'object' && s !== null) {
                // If it has a type field, use that
                if (s.type && typeof s.type === 'string') {
                  return s.type.trim()
                }
                // Otherwise, try to stringify and extract meaningful text
                const str = JSON.stringify(s)
                // Try to extract text from common fields
                if (s.text) return String(s.text).trim()
                if (s.suggestion) return String(s.suggestion).trim()
                if (s.description) return String(s.description).trim()
                // Fallback to string representation
                return str && str.length > 0 && !str.match(/^[:\[\]]+$/) ? str : null
              }
              
              // Handle strings
              if (typeof s === 'string') {
                let suggestion = s.trim()
                // Skip invalid entries
                if (!suggestion || suggestion.length === 0 || suggestion.match(/^[:\[\]]+$/)) {
                  return null
                }
                // Clean up if it's JSON-encoded
                if (suggestion.startsWith('"') && suggestion.endsWith('"')) {
                  try {
                    suggestion = JSON.parse(suggestion)
                  } catch {
                    suggestion = suggestion.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, ' ')
                  }
                }
                const cleaned = suggestion.replace(/\\n/g, ' ').trim()
                return cleaned && cleaned.length > 0 && !cleaned.match(/^[:\[\]]+$/) ? cleaned : null
              }
              
              // Handle other types
              const str = String(s).trim()
              return str && str.length > 0 && !str.match(/^[:\[\]]+$/) ? str : null
            })
            .filter((s) => s !== null && s !== undefined)
            .slice(0, 3)
        }
        
        // Combine everything into one summary string
        let combinedSummary = cleanSummary
        
        if (cleanRisks.length > 0) {
          combinedSummary += '\n\nRisks to Watch:\n' + cleanRisks.map((r, i) => `${i + 1}. ${r}`).join('\n')
        }
        
        if (cleanSuggestions.length > 0) {
          combinedSummary += '\n\nSuggestions:\n' + cleanSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')
        }
        
        const response = {
          summary: combinedSummary,
          risks: [],
          suggestions: [],
        }
        console.log('📤 Sending response:', JSON.stringify(response, null, 2))
        return res.json(response)
      }

      // Fallback: if JSON parsing failed, try to extract structured data from text
      console.log(`⚠️  Could not parse JSON from Ollama, attempting text extraction`)
      
      // Try to extract summary, risks, and suggestions using regex patterns
      let fallbackSummary = cleanedText.split('\n').slice(0, 3).join(' ').trim() || 'AI analysis generated.'
      const fallbackRisks = []
      const fallbackSuggestions = []
      
      // First, try to extract from the malformed JSON structure we're seeing
      // Pattern: {"summary":"...","risks":["item1","item2","item3","}, {"suggestions":["sug1"
      const summaryMatch = cleanedText.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (summaryMatch && summaryMatch[1]) {
        fallbackSummary = summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim()
      }
      
      // Extract risks array - handle the malformed pattern where it ends with "} instead of ]
      // Pattern: "risks":["item1","item2","item3"}
      const risksArrayMatch = cleanedText.match(/"risks"\s*:\s*\[(.*?)(?:"\s*}|"\s*\]|$)/is)
      if (risksArrayMatch && risksArrayMatch[1]) {
        const risksText = risksArrayMatch[1]
        // Extract all quoted strings from the risks array
        const riskQuotes = risksText.match(/"([^"]+)"/g)
        if (riskQuotes) {
          riskQuotes.forEach(quote => {
            const cleaned = quote.replace(/^"|"$/g, '').trim()
            if (cleaned && cleaned.length > 0 && !cleaned.match(/^[:\[\]]+$/)) {
              fallbackRisks.push(cleaned)
            }
          })
        }
      }
      
      // Extract suggestions array - handle both strings and objects
      // Pattern: "suggestions":[{"type":"..."} or "suggestions":["item1","item2"]
      const suggestionsArrayMatch = cleanedText.match(/"suggestions"\s*:\s*\[(.*?)(?:"\s*\]|"\s*}|$)/is)
      if (suggestionsArrayMatch && suggestionsArrayMatch[1]) {
        const suggestionsText = suggestionsArrayMatch[1]
        // First try to extract objects with type field: {"type":"..."}
        const suggestionObjects = suggestionsText.match(/\{"type"\s*:\s*"([^"]+)"\}/g)
        if (suggestionObjects) {
          suggestionObjects.forEach(obj => {
            const typeMatch = obj.match(/"type"\s*:\s*"([^"]+)"/)
            if (typeMatch && typeMatch[1]) {
              const cleaned = typeMatch[1].trim()
              if (cleaned && cleaned.length > 0 && !cleaned.match(/^[:\[\]]+$/)) {
                fallbackSuggestions.push(cleaned)
              }
            }
          })
        }
        // If no objects found, try to extract quoted strings
        if (fallbackSuggestions.length === 0) {
          const suggestionQuotes = suggestionsText.match(/"([^"]+)"/g)
          if (suggestionQuotes) {
            suggestionQuotes.forEach(quote => {
              const cleaned = quote.replace(/^"|"$/g, '').trim()
              if (cleaned && cleaned.length > 0 && !cleaned.match(/^[:\[\]]+$/)) {
                fallbackSuggestions.push(cleaned)
              }
            })
          }
        }
      }
      
      // If we didn't extract risks from JSON structure, try text-based extraction
      if (fallbackRisks.length === 0) {
        const risksMatch = cleanedText.match(/risks?[:\-]?\s*(?:\n|\[|")(.*?)(?:\n\n|suggestions?|$)/is)
        if (risksMatch) {
          const risksText = risksMatch[1]
          // Try to extract list items (numbered, bulleted, or quoted)
          const riskItems = risksText.match(/(?:^|\n)[\s\-*•]*(?:\d+\.\s*)?["']?([^"'\n]+)["']?/gim)
          if (riskItems) {
            riskItems.slice(0, 3).forEach(item => {
              const cleaned = item.replace(/^[\s\-*•\d."']+/, '').trim()
              if (cleaned && !cleaned.match(/^[:\[\]]+$/)) {
                fallbackRisks.push(cleaned)
              }
            })
          }
        }
      }
      
      // If we didn't extract suggestions from JSON structure, try text-based extraction
      if (fallbackSuggestions.length === 0) {
        const suggestionsMatch = cleanedText.match(/suggestions?[:\-]?\s*(?:\n|\[|")(.*?)$/is)
        if (suggestionsMatch) {
          const suggestionsText = suggestionsMatch[1]
          // Try to extract list items (numbered, bulleted, or quoted)
          const suggestionItems = suggestionsText.match(/(?:^|\n)[\s\-*•]*(?:\d+\.\s*)?["']?([^"'\n]+)["']?/gim)
          if (suggestionItems) {
            suggestionItems.slice(0, 3).forEach(item => {
              const cleaned = item.replace(/^[\s\-*•\d."']+/, '').trim()
              if (cleaned && !cleaned.match(/^[:\[\]]+$/)) {
                fallbackSuggestions.push(cleaned)
              }
            })
          }
        }
      }
      
      // If we still don't have risks/suggestions, try alternative JSON extraction patterns
      if (fallbackRisks.length === 0) {
        // Try a simpler pattern for risks array
        const risksArrayMatch = cleanedText.match(/"risks?"\s*:\s*\[(.*?)\]/is)
        if (risksArrayMatch) {
          const risksArrayText = risksArrayMatch[1]
          // Try to extract quoted strings
          const riskQuotes = risksArrayText.match(/"([^"]+)"/g)
          if (riskQuotes) {
            riskQuotes.slice(0, 3).forEach(quote => {
              const cleaned = quote.replace(/^"|"$/g, '').trim()
              if (cleaned && !cleaned.match(/^[:\[\]]+$/)) {
                fallbackRisks.push(cleaned)
              }
            })
          }
          // Also try unquoted items if no quotes found
          if (!riskQuotes || riskQuotes.length === 0) {
            const riskItems = risksArrayText.split(',').map(r => r.trim().replace(/^["']|["']$/g, '')).filter(r => r && r.length > 0 && !r.match(/^[:\[\]]+$/))
            fallbackRisks.push(...riskItems.slice(0, 3))
          }
        }
      }
      
      if (fallbackSuggestions.length === 0) {
        // Try a simpler pattern for suggestions array
        const suggestionsArrayMatch = cleanedText.match(/"suggestions?"\s*:\s*\[(.*?)\]/is)
        if (suggestionsArrayMatch) {
          const suggestionsArrayText = suggestionsArrayMatch[1]
          // Try to extract quoted strings
          const suggestionQuotes = suggestionsArrayText.match(/"([^"]+)"/g)
          if (suggestionQuotes) {
            suggestionQuotes.slice(0, 3).forEach(quote => {
              const cleaned = quote.replace(/^"|"$/g, '').trim()
              if (cleaned && !cleaned.match(/^[:\[\]]+$/)) {
                fallbackSuggestions.push(cleaned)
              }
            })
          }
          // Also try unquoted items if no quotes found
          if (!suggestionQuotes || suggestionQuotes.length === 0) {
            const suggestionItems = suggestionsArrayText.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s && s.length > 0 && !s.match(/^[:\[\]]+$/))
            fallbackSuggestions.push(...suggestionItems.slice(0, 3))
          }
        }
      }
      
      // Combine everything into one summary string
      let combinedFallbackSummary = fallbackSummary
      
      if (fallbackRisks.length > 0) {
        combinedFallbackSummary += '\n\nRisks to Watch:\n' + fallbackRisks.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('\n')
      }
      
      if (fallbackSuggestions.length > 0) {
        combinedFallbackSummary += '\n\nSuggestions:\n' + fallbackSuggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join('\n')
      }
      
      const fallbackResponse = {
        summary: combinedFallbackSummary,
        risks: [],
        suggestions: [],
      }
      console.log('📤 Sending fallback response:', JSON.stringify(fallbackResponse, null, 2))
      return res.json(fallbackResponse)
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

/**
 * POST /api/predict-outcome
 * 
 * Receives company summary and scenario data, returns AI prediction
 * on whether the company will "take off" or "crash"
 */
app.post('/api/predict-outcome', async (req, res) => {
  try {
    const { companySummary, scenario, burnResult, runway } = req.body

    if (!companySummary || !scenario || !burnResult || !runway) {
      return res.status(400).json({
        error: 'Missing required fields: companySummary, scenario, burnResult, or runway',
      })
    }

    if (companySummary.length > 100) {
      return res.status(400).json({
        error: 'Company summary must be 100 characters or less',
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

    const prompt = `You are a startup advisor evaluating whether a company will "take off" or "crash".

Company Summary: ${companySummary}

Financial Situation:
- Starting Cash: $${scenario.startingCash.toLocaleString()}
- Projection Period: ${scenario.projectionMonths} months
- Average Monthly Burn: $${Math.round(summary.averageMonthlyBurn).toLocaleString()}
- ${runway.hasRunwayEnd ? `Cash runs out in ${runway.runwayMonths} months` : `Projected ending cash: $${Math.round(runway.endingCash).toLocaleString()}`}

Hiring Plan:
${hasAnyHires ? hiresText : 'No hires planned'}

Non-Headcount Costs (total): $${Math.round(summary.totalNonHeadcountCost).toLocaleString()}

Based on the company summary and financial information provided, evaluate:
1. What type of company this is (e.g., SaaS, marketplace, hardware, etc.)
2. Whether this company will TAKE OFF or CRASH

Respond with ONLY a JSON object in this exact format (no backticks, no extra text):
{"prediction":"TAKE OFF" or "CRASH","confidence":"HIGH" or "MEDIUM" or "LOW","reasoning":"A brief 2-3 sentence explanation of your prediction","companyType":"A brief comment about the type of company and its characteristics based on the summary"}`

    // Call Ollama API
    console.log(`🔄 Calling Ollama (${OLLAMA_MODEL}) for outcome prediction...`)
    
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
            num_predict: 300,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Ollama API error (${response.status}):`, errorText)
        
        if (response.status === 404) {
          return res.status(503).json({
            error: `Model "${OLLAMA_MODEL}" not found. Please run: ollama pull ${OLLAMA_MODEL}`,
          })
        }
        
        return res.status(503).json({
          error: `Ollama API returned ${response.status}. Make sure Ollama is running (ollama serve)`,
        })
      }

      const data = await response.json()
      const fullText = data.response || ''

      console.log('📝 Raw Ollama response:', fullText.substring(0, 200))

      // Try to extract JSON from the response
      let predictionResult
      try {
        // Try parsing the full response as JSON first
        predictionResult = JSON.parse(fullText)
      } catch (parseError) {
        // If that fails, try to extract JSON object from the text
        const jsonMatch = fullText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          predictionResult = JSON.parse(jsonMatch[0])
        } else {
          // Fallback: create a structured response from text
          const lowerText = fullText.toLowerCase()
          const isTakeOff = lowerText.includes('take off') || lowerText.includes('success') || lowerText.includes('succeed')
          const isCrash = lowerText.includes('crash') || lowerText.includes('fail') || lowerText.includes('failure')
          
          predictionResult = {
            prediction: isTakeOff ? 'TAKE OFF' : (isCrash ? 'CRASH' : 'TAKE OFF'),
            confidence: 'MEDIUM',
            reasoning: fullText.substring(0, 200) || 'Unable to parse AI response',
            companyType: 'Unable to determine company type from response',
          }
        }
      }

      // Validate and normalize the response
      const normalized = {
        prediction: predictionResult.prediction === 'CRASH' ? 'CRASH' : 'TAKE OFF',
        confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(predictionResult.confidence) 
          ? predictionResult.confidence 
          : 'MEDIUM',
        reasoning: predictionResult.reasoning || predictionResult.reason || 'No reasoning provided',
        companyType: predictionResult.companyType || predictionResult.company_type || 'Company type not specified',
      }

      console.log('✅ Prediction result:', normalized)

      return res.json(normalized)
    } catch (fetchError) {
      console.error('❌ Error calling Ollama:', fetchError.message)
      
      if (fetchError.code === 'ECONNREFUSED') {
        return res.status(503).json({
          error: 'Cannot connect to Ollama. Make sure Ollama is running: ollama serve',
        })
      }
      
      return res.status(500).json({
        error: `Failed to call Ollama: ${fetchError.message}`,
      })
    }
  } catch (error) {
    console.error('❌ Error in /api/predict-outcome:', error)
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`)
  console.log(`🤖 Ollama URL: ${OLLAMA_URL}`)
  console.log(`📦 Ollama Model: ${OLLAMA_MODEL}`)
  console.log(`\n💡 Make sure Ollama is running: ollama serve`)
  console.log(`💡 Pull a model if needed: ollama pull ${OLLAMA_MODEL}`)
})
