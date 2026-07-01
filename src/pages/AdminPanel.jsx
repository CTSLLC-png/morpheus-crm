export function SystemHealthCheck({ status }) {
  const checks = [
    { label: 'Supabase DB',        ok: status.db === 'ok',  detail: status.db === 'ok' ? `${status.latency}ms latency` : 'Connection failed' },
    { label: 'Anthropic API key',  ok: status.apiKey,       detail: status.apiKey ? 'Key present in environment' : 'VITE_ANTHROPIC_API_KEY missing' },
    { label: 'Supabase project',   ok: !!status.supabaseUrl, detail: status.supabaseUrl ?? 'Not configured' },
    { label: 'App domain',         ok: true,                 detail: window.location.host },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      {checks.map(c => (
        <div key={c.label} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px', background:'var(--color-background-secondary)', borderRadius:'10px' }}>
          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: c.ok ? '#27C080' : '#E24B4A', flexShrink:0 }} />
          <span style={{ fontSize:'13px', fontWeight:500, color:'var(--color-text-primary)', flex:1 }}>{c.label}</span>
          <span style={{ fontSize:'12px', color:'var(--color-text-tertiary)', fontFamily:'monospace' }}>{c.detail}</span>
        </div>
      ))}
      <div style={{ marginTop:'8px', fontSize:'12px', color:'var(--color-text-tertiary)', lineHeight:'1.6' }}>
        Morpheus CRM v1.0 · Sprint 3 complete · morpheuscr.com
      </div>
    </div>
  )
}
