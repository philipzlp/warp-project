/**
 * AI Suggestions Helper (Ollama)
 * 
 * This module provides a way to get AI-generated suggestions
 * by calling our backend server, which handles the Ollama API.
 */

/**
 * Generates AI suggestions for a headcount planning scenario
 * 
 * @param {Object} scenario - The scenario object (from engine.js)
 * @param {Object} burnResult - The burn rate calculation result
 * @param {Object} runway - The runway estimation result
 * @returns {Promise<Object>} Object with summary, risks, and suggestions
 */
export async function getAISuggestions(scenario, burnResult, runway) {
  try {
    const response = await fetch('/api/review-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scenario,
        burnResult,
        runway,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.error || `Server returned ${response.status}: ${response.statusText}`
      )
    }

    const data = await response.json()
    return {
      summary: data.summary || 'AI analysis generated successfully.',
      risks: data.risks || [],
      suggestions: data.suggestions || [],
    }
  } catch (error) {
    console.error('Error fetching AI suggestions:', error)
    throw error
  }
}
