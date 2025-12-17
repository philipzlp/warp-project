import { useState, useEffect } from 'react'

/**
 * AI Insights Component
 * Displays AI-generated summary, risks, and suggestions for the current scenario
 * Uses Ollama (local LLM) via backend server
 * 
 * @param {Object} scenario - The current scenario
 * @param {Object} burnResult - Burn rate calculation result
 * @param {Object} runway - Runway estimation result
 * @param {Function} onGenerate - Function to generate AI insights
 * @param {Object|null} initialInsights - Saved AI insights for this scenario
 * @param {Function} onInsightsSaved - Callback to save insights to scenario
 */
export default function AIInsights({ scenario, burnResult, runway, onGenerate, initialInsights, onInsightsSaved }) {
  const [insights, setInsights] = useState(initialInsights)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Update insights when scenario changes (switching between scenarios)
  useEffect(() => {
    setInsights(initialInsights)
    setError(null)
  }, [scenario.id, initialInsights])

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await onGenerate(scenario, burnResult, runway)
      setInsights(result)
      // Save insights to the scenario
      if (onInsightsSaved) {
        onInsightsSaved(result)
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to generate AI insights'
      console.error('Error generating insights:', err)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-insights-container" style={{
      marginTop: '2rem',
      maxWidth: '720px',
      margin: '0.75rem auto 2rem',
      padding: '1.5rem',
      backgroundColor: '#1a1a1a',
      borderRadius: '8px',
      border: '1px solid #333',
    }}>
      <h2 style={{ margin: '0 0 1rem 0', textAlign: 'center', fontSize: '1.25rem', fontWeight: '600', color: '#fff' }}>
        AI Insights
      </h2>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            width: '90%',
            padding: '0.75rem 1rem',
            backgroundColor: loading ? '#444' : '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            fontWeight: '500',
          }}
        >
          {loading ? 'Generating...' : 'Generate Insights'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#7f1d1d',
          border: '1px solid #991b1b',
          borderRadius: '6px',
          color: '#fca5a5',
          marginBottom: '1rem',
        }}>
          <strong>Error:</strong> {error}
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Make sure the backend server is running (npm run dev:server) and Ollama is installed and running.
          </div>
        </div>
      )}

      {insights && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ 
              fontSize: '1rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: '#a5b4fc',
            }}>
              Summary
            </h3>
            <p style={{ 
              lineHeight: '1.6', 
              color: '#d1d5db',
              margin: 0,
            }}>
              {(() => {
                // Clean up summary - extract just the text if it's a JSON string
                let summaryText = String(insights.summary || '').trim()
                
                // If summary contains JSON structure, try to extract just the summary value
                if (summaryText.includes('"summary"') && summaryText.includes('"risks"')) {
                  try {
                    // Try to parse as JSON
                    const parsed = JSON.parse(summaryText)
                    summaryText = parsed.summary || summaryText
                  } catch {
                    // If parsing fails, try regex extraction
                    const match = summaryText.match(/"summary"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/)
                    if (match) {
                      summaryText = match[1].replace(/\\"/g, '"').replace(/\\n/g, ' ')
                    }
                  }
                }
                
                // Remove JSON string quotes if present
                if (summaryText.startsWith('"') && summaryText.endsWith('"')) {
                  summaryText = summaryText.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, ' ')
                }
                
                return summaryText
              })()}
            </p>
          </div>

        </div>
      )}

      {!insights && !loading && !error && (
        <p style={{ 
          color: '#9ca3af', 
          fontSize: '0.9rem',
          fontStyle: 'italic',
          textAlign: 'center',
          margin: 0,
        }}>
          Click "Generate Insights" to get AI-powered analysis and suggestions for your hiring plan using Ollama (local LLM).
        </p>
      )}
    </div>
  )
}
