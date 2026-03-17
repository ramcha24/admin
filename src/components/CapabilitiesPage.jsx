import React, { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, Copy, Check, ChevronDown, ChevronRight, Zap, Play } from 'lucide-react'

// ─── Multi-select tool dropdown ───────────────────────────────────────────────

function ToolDropdown({ tools, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])

  const label = selected.length === 0
    ? 'All tools'
    : selected.length === 1
      ? (tools.find(t => t.id === selected[0])?.name ?? selected[0])
      : `${selected.length} tools`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          open || selected.length > 0
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="min-w-[16px] h-[16px] inline-flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold px-1">
            {selected.length}
          </span>
        )}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[160px] py-1">
          <div className="flex gap-2 px-3 py-1.5 border-b border-gray-50">
            <button onClick={() => onChange(tools.map(t => t.id))} className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium">All</button>
            <span className="text-gray-200">·</span>
            <button onClick={() => onChange([])} className="text-[11px] text-gray-400 hover:text-gray-600">Clear</button>
          </div>
          {tools.map(tool => {
            const checked = selected.includes(tool.id)
            return (
              <button key={tool.id} onClick={() => toggle(tool.id)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left">
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                  {checked && <Check size={10} className="text-white" />}
                </span>
                <span className="text-sm">{tool.icon}</span>
                <span className="text-xs text-gray-700 font-medium">{tool.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SchemaTable({ schema }) {
  const entries = Object.entries(schema)
  if (!entries.length) return <span className="text-xs text-gray-400 italic">no parameters</span>
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-gray-400">
          <th className="pr-3 pb-1 font-medium">Field</th>
          <th className="pr-3 pb-1 font-medium">Type</th>
          <th className="pr-3 pb-1 font-medium">Required</th>
          <th className="pb-1 font-medium">Description</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([field, spec]) => {
          const s = typeof spec === 'string' ? { type: spec } : spec
          return (
            <tr key={field} className="border-t border-gray-50">
              <td className="pr-3 py-1 font-mono text-gray-900">{field}</td>
              <td className="pr-3 py-1 text-violet-600 font-mono">{s.type ?? '?'}</td>
              <td className="pr-3 py-1">{s.required === false ? <span className="text-gray-300">optional</span> : <span className="text-amber-500">required</span>}</td>
              <td className="py-1 text-gray-500">{s.description ?? ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
      {copied ? <><Check size={11} className="text-emerald-500" /> Copied</> : <><Copy size={11} /> Copy</>}
    </button>
  )
}

function buildSnippet(cap) {
  const examplePayload = {}
  for (const [field, spec] of Object.entries(cap.input_schema)) {
    const s = typeof spec === 'string' ? { type: spec } : spec
    if (s.required === false) continue
    if (s.type === 'number') examplePayload[field] = 0
    else if (s.type === 'boolean') examplePayload[field] = true
    else examplePayload[field] = `"..."`
  }

  const payloadStr = Object.entries(examplePayload)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join(',\n')

  return `// From any tool — calls Admin gateway which validates & routes
const result = await fetch('${cap.gateway_url}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
${payloadStr}
  }),
}).then(r => r.json())

// From within Admin (via Electron IPC):
const result = await window.api.callCapability('${cap.service_id}', {
${payloadStr}
})`
}

function TryItPanel({ cap }) {
  const fields = Object.entries(cap.input_schema)
  const [values, setValues] = useState(() => {
    const init = {}
    for (const [field] of fields) init[field] = ''
    return init
  })
  const [calling, setCalling] = useState(false)
  const [result, setResult]   = useState(null) // { ok, data } | { ok: false, error }

  const call = async () => {
    setCalling(true)
    setResult(null)
    try {
      const payload = {}
      for (const [field, spec] of fields) {
        const s = typeof spec === 'string' ? { type: spec } : spec
        const raw = values[field]
        if (s.type === 'number') payload[field] = raw === '' ? undefined : Number(raw)
        else if (s.type === 'boolean') payload[field] = raw === 'true' || raw === '1'
        else payload[field] = raw
      }
      const data = await window.api.callCapability(cap.service_id, payload)
      setResult({ ok: true, data })
    } catch (err) {
      setResult({ ok: false, error: String(err) })
    } finally {
      setCalling(false)
    }
  }

  if (fields.length === 0) {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Try it</p>
        <button
          onClick={call}
          disabled={calling}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {calling ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
          Call
        </button>
        {result && (
          <pre className={`mt-2 text-xs font-mono rounded-lg px-3 py-3 overflow-x-auto whitespace-pre-wrap ${result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
            {result.ok ? JSON.stringify(result.data, null, 2) : result.error}
          </pre>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Try it</p>
      <div className="space-y-2 mb-3">
        {fields.map(([field, spec]) => {
          const s = typeof spec === 'string' ? { type: spec } : spec
          return (
            <div key={field} className="flex items-center gap-3">
              <label className="text-xs font-mono text-gray-700 w-28 shrink-0">
                {field}
                {s.required !== false && <span className="text-amber-500 ml-0.5">*</span>}
              </label>
              <input
                type={s.type === 'number' ? 'number' : 'text'}
                value={values[field]}
                onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))}
                placeholder={s.type ?? 'string'}
                className="flex-1 text-xs font-mono border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 bg-white"
              />
            </div>
          )
        })}
      </div>
      <button
        onClick={call}
        disabled={calling}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {calling ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
        {calling ? 'Calling…' : 'Call'}
      </button>
      {result && (
        <pre className={`mt-2 text-xs font-mono rounded-lg px-3 py-3 overflow-x-auto whitespace-pre-wrap ${result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {result.ok ? JSON.stringify(result.data, null, 2) : result.error}
        </pre>
      )}
    </div>
  )
}

function CapabilityCard({ cap }) {
  const [open, setOpen] = useState(false)
  const snippet = buildSnippet(cap)

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-lg shrink-0">{cap.tool_icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-gray-900">{cap.service_id}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
              {cap.tool_name}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5 leading-snug">{cap.description}</p>
        </div>
        <span className="text-gray-300 shrink-0 mt-1">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-50 space-y-4">
          {/* Input schema */}
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 mt-3">Input</p>
            <SchemaTable schema={cap.input_schema} />
          </div>

          {/* Output */}
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Output</p>
            <pre className="text-xs text-gray-500 font-mono whitespace-pre-wrap">
              {typeof cap.output_schema === 'string'
                ? cap.output_schema
                : JSON.stringify(cap.output_schema, null, 2)}
            </pre>
          </div>

          {/* Gateway URL */}
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Gateway URL</p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <code className="text-xs text-indigo-600 flex-1 font-mono break-all">{cap.gateway_url}</code>
              <CopyButton text={cap.gateway_url} />
            </div>
          </div>

          {/* Invocation snippet */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">How to call</p>
              <CopyButton text={snippet} />
            </div>
            <pre className="text-xs text-gray-700 font-mono bg-gray-50 rounded-lg px-3 py-3 overflow-x-auto whitespace-pre">
              {snippet}
            </pre>
          </div>

          {/* Try it panel */}
          <div className="border-t border-gray-100 pt-4">
            <TryItPanel cap={cap} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function CapabilitiesPage() {
  const [caps,    setCaps]    = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState([]) // empty = all tools
  const [tools,   setTools]   = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [all, discovered] = await Promise.all([
        window.api.getCapabilities(),
        window.api.discoverTools(),
      ])
      setCaps(all)
      setTools(discovered)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filter.length === 0 ? caps : caps.filter(c => filter.includes(c.tool_id))

  // Group by tool
  const grouped = filtered.reduce((acc, c) => {
    if (!acc[c.tool_id]) acc[c.tool_id] = []
    acc[c.tool_id].push(c)
    return acc
  }, {})

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Service Contracts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {caps.length} callable service{caps.length !== 1 ? 's' : ''} across {tools.filter(t => t.services?.length).length} tools ·
            {' '}<span className="font-mono text-xs text-indigo-600">gateway: http://localhost:7702</span>
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* How it works banner */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-5">
        <Zap size={15} className="text-indigo-500 mt-0.5 shrink-0" />
        <div className="text-sm text-indigo-700 space-y-0.5">
          <p className="font-medium">Any tool can call any service — Admin validates and routes.</p>
          <p className="text-indigo-500 text-xs">
            POST to the gateway URL with a JSON payload. Admin checks the input schema, then proxies to the target tool's service server. If the tool isn't running, you get a 503.
          </p>
        </div>
      </div>

      {/* Tool filter dropdown */}
      <div className="mb-5">
        <ToolDropdown
          tools={tools.filter(t => t.services?.length)}
          selected={filter}
          onChange={setFilter}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw size={18} className="animate-spin mr-2" /> Loading…
        </div>
      ) : caps.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔌</p>
          <p className="font-medium">No services registered yet</p>
          <p className="text-sm mt-1">Add a <code className="font-mono text-xs">services</code> array to a tool's <code className="font-mono text-xs">tool.json</code> and refresh.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([toolId, services]) => {
            const tool = tools.find(t => t.id === toolId)
            return (
              <div key={toolId}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{tool?.icon ?? '📦'}</span>
                  <h2 className="text-sm font-semibold text-gray-700">{tool?.name ?? toolId}</h2>
                  <span className="text-xs text-gray-400">port {tool?.service_port ?? '—'}</span>
                </div>
                <div className="space-y-2">
                  {services.map(cap => <CapabilityCard key={cap.service_id} cap={cap} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
