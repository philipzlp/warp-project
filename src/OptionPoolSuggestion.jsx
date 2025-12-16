import { useState } from 'react'

// Option pool size data from Carta (based on 28,000 US employee stock option pools)
const OPTION_POOL_DATA = [
  { min: 1_000_000, max: 10_000_000, p25: 8.9, median: 12.9, p75: 18.5 },
  { min: 10_000_000, max: 25_000_000, p25: 9.7, median: 13.7, p75: 19.5 },
  { min: 25_000_000, max: 50_000_000, p25: 9.9, median: 14.0, p75: 19.4 },
  { min: 50_000_000, max: 100_000_000, p25: 11.3, median: 15.5, p75: 20.5 },
  { min: 100_000_000, max: 250_000_000, p25: 11.9, median: 16.0, p75: 20.6 },
  { min: 250_000_000, max: 500_000_000, p25: 12.8, median: 16.9, p75: 21.3 },
  { min: 500_000_000, max: 1_000_000_000, p25: 12.6, median: 17.2, p75: 22.2 },
  { min: 1_000_000_000, max: 10_000_000_000, p25: 14.3, median: 19.6, p75: 25.5 },
]

function OptionPoolSuggestion() {
  const [valuation, setValuation] = useState('')

  const formatCurrency = (value) => {
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(1)}B`
    } else if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`
    } else if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(0)}K`
    }
    return `$${value.toLocaleString()}`
  }

  const findPoolData = (val) => {
    if (!val || val <= 0) return null
    return OPTION_POOL_DATA.find((tier) => val >= tier.min && val < tier.max)
  }

  const poolData = findPoolData(Number(valuation))

  const handleValuationChange = (e) => {
    const raw = e.target.value.replace(/,/g, '')
    setValuation(raw)
  }

  return (
    <div
      style={{
        width: '100%',
        padding: '0 2rem',
        marginTop: '2rem',
        marginBottom: '2rem',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '2px solid #fbbf24',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <h2
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#000000',
            }}
          >
            Employee Option Pool Size Suggestion
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              color: '#6b7280',
              fontStyle: 'italic',
            }}
          >
            Based on 28,000 US employee stock option pools (Carta data)
          </p>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '1rem',
              fontWeight: 600,
              color: '#1f2937',
            }}
          >
            Company Valuation
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem', color: '#1f2937', fontWeight: 600 }}>$</span>
            <input
              type="text"
              value={valuation ? Number(valuation).toLocaleString() : ''}
              onChange={handleValuationChange}
              placeholder="Enter valuation (e.g., 5000000)"
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '2px solid #d1d5db',
                fontSize: '1rem',
                backgroundColor: '#fff',
                color: '#1f2937',
                maxWidth: '300px',
              }}
            />
          </div>
          <p
            style={{
              margin: '0.5rem 0 0 0',
              fontSize: '0.85rem',
              color: '#6b7280',
            }}
          >
            Enter your company's current valuation
          </p>
        </div>

        {poolData && (
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              border: '1px solid #fbbf24',
            }}
          >
            <div
              style={{
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: '2px solid #fef3c7',
              }}
            >
              <h3
                style={{
                  margin: '0 0 0.5rem 0',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                Recommended Option Pool Size
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9rem',
                  color: '#6b7280',
                }}
              >
                Valuation range: {formatCurrency(poolData.min)} - {formatCurrency(poolData.max)}
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                  padding: '1rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '2px solid #10b981',
                }}
              >
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#065f46',
                    marginBottom: '0.5rem',
                    fontWeight: 600,
                  }}
                >
                  25th Percentile
                </div>
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 700,
                    color: '#047857',
                  }}
                >
                  {poolData.p25}%
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#065f46',
                    marginTop: '0.25rem',
                  }}
                >
                  Conservative
                </div>
              </div>

              <div
                style={{
                  textAlign: 'center',
                  padding: '1rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '2px solid #3b82f6',
                }}
              >
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#1e40af',
                    marginBottom: '0.5rem',
                    fontWeight: 600,
                  }}
                >
                  Median
                </div>
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 700,
                    color: '#1e3a8a',
                  }}
                >
                  {poolData.median}%
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#1e40af',
                    marginTop: '0.25rem',
                  }}
                >
                  Recommended
                </div>
              </div>

              <div
                style={{
                  textAlign: 'center',
                  padding: '1rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '2px solid #ef4444',
                }}
              >
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#991b1b',
                    marginBottom: '0.5rem',
                    fontWeight: 600,
                  }}
                >
                  75th Percentile
                </div>
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 700,
                    color: '#dc2626',
                  }}
                >
                  {poolData.p75}%
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#991b1b',
                    marginTop: '0.25rem',
                  }}
                >
                  Aggressive
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#ffffff',
                borderRadius: '6px',
                border: '1px solid #fbbf24',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '0.85rem',
                  color: '#374151',
                  lineHeight: '1.6',
                }}
              >
                <strong>Note:</strong> These percentages represent the percent of fully diluted
                company equity authorized in the option pool. The median value is typically
                recommended as a starting point, but you may adjust based on your hiring plans and
                equity strategy.
              </p>
            </div>
          </div>
        )}

        {valuation && !poolData && Number(valuation) > 0 && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #fbbf24',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '0.9rem',
                color: '#374151',
              }}
            >
              Valuation outside typical range. Please enter a value between $1M and $10B.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default OptionPoolSuggestion

