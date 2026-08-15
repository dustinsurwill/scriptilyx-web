import type { GraphIssue } from '../lib/graphIssues'

interface ValidationPanelProps {
  issues: GraphIssue[]
}

export function ValidationPanel({ issues }: ValidationPanelProps) {
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Validation</h2>
      {issues.length === 0 ? (
        <p style={{ fontSize: 12, color: '#22c55e' }}>No problems found.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {issues.map((issue, i) => (
            <li
              key={i}
              style={{
                fontSize: 12,
                padding: '4px 0',
                color: issue.severity === 'error' ? '#ef4444' : '#f59e0b',
              }}
            >
              {issue.severity === 'error' ? 'Error' : 'Warning'}: {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
