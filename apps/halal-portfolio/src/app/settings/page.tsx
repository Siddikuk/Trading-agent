'use client'

import { useState, useEffect } from 'react'
import { loadSettings, saveSettings, Settings } from '@/lib/t212'
import { Key, Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    apiKey: '', privateKey: '', accountType: 'live', weeklyBudget: 50, dcaDay: 0,
  })
  const [showKey, setShowKey] = useState(false)
  const [showPK, setShowPK] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => { setMounted(true); setSettings(loadSettings()) }, [])

  if (!mounted) return null

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/t212/equity/account/summary', {
        headers: {
          'x-t212-key': settings.apiKey,
          'x-t212-private-key': settings.privateKey,
          'x-t212-account': settings.accountType,
        },
      })
      if (res.ok) {
        const data = await res.json()
        const total = data?.cash?.total?.toFixed(2) ?? '?'
        setTestResult({ ok: true, msg: `Connected! Account total: £${total}` })
      } else {
        let msg = `Error ${res.status}`
        try {
          const err = await res.json()
          msg = err?.message || err?.error || JSON.stringify(err)
        } catch { /* ignore */ }
        if (res.status === 401) msg = `401 — check account type matches your key (Live key → Live, Demo key → Demo)`
        setTestResult({ ok: false, msg })
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Connection failed' })
    }
    setTesting(false)
  }

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Connect your Trading 212 account</p>
      </div>

      {/* Guide */}
      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 space-y-2">
        <p className="text-sm font-medium text-blue-300">How to get your T212 API keys</p>
        <ol className="text-xs text-zinc-400 space-y-1 list-decimal list-inside">
          <li>Open Trading 212 → Settings → API (bottom of menu)</li>
          <li>Generate API key — it gives you <strong className="text-zinc-300">two keys</strong>: an API key and a Private key</li>
          <li>Copy both and paste them below</li>
        </ol>
        <a href="https://www.trading212.com/settings/api" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
          Open T212 API settings <ExternalLink size={10} />
        </a>
      </div>

      {/* Account type */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Account type</p>
        <p className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800/30 rounded-lg px-3 py-2">
          ⚠ Must match your key. Real money = Live. Practice account = Demo. Wrong choice = 401 error.
        </p>
        <div className="flex gap-3">
          {(['live', 'demo'] as const).map(t => (
            <button key={t} onClick={() => setSettings(s => ({ ...s, accountType: t }))}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                settings.accountType === t
                  ? t === 'live' ? 'bg-green-900/50 border-green-600/50 text-green-300' : 'bg-blue-900/50 border-blue-600/50 text-blue-300'
                  : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
              }`}>
              {t === 'live' ? '🔴 Live (real money)' : '🔵 Demo (practice)'}
            </button>
          ))}
        </div>
      </div>

      {/* Keys */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-4">
        <p className="text-sm font-medium text-zinc-200 flex items-center gap-2">
          <Key size={13} className="text-green-400" /> API Key &amp; Private Key
        </p>

        {[
          { label: 'API Key', field: 'apiKey' as const, show: showKey, toggle: () => setShowKey(v => !v) },
          { label: 'Private Key', field: 'privateKey' as const, show: showPK, toggle: () => setShowPK(v => !v) },
        ].map(({ label, field, show, toggle }) => (
          <div key={field} className="space-y-1.5">
            <p className="text-xs text-zinc-500">{label}</p>
            <div className="flex gap-2">
              <input
                type={show ? 'text' : 'password'}
                value={settings[field]}
                onChange={e => setSettings(s => ({ ...s, [field]: e.target.value }))}
                placeholder={`Paste your T212 ${label.toLowerCase()}`}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-green-600 transition-colors"
              />
              <button onClick={toggle}
                className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors">
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        ))}

        <button onClick={handleTest} disabled={!settings.apiKey || testing}
          className="px-4 py-2 bg-blue-900/50 border border-blue-700/50 text-blue-300 rounded-lg text-sm hover:bg-blue-900/70 transition-colors disabled:opacity-40">
          {testing ? 'Testing…' : 'Test connection'}
        </button>

        {testResult && (
          <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${
            testResult.ok
              ? 'bg-green-900/30 border border-green-700/30 text-green-300'
              : 'bg-red-900/30 border border-red-700/30 text-red-300'
          }`}>
            {testResult.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
            {testResult.msg}
          </div>
        )}
      </div>

      {/* Weekly budget */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">
          Weekly budget: <span className="text-green-300 font-bold">£{settings.weeklyBudget}</span>
        </p>
        <input type="range" min={10} max={500} step={5}
          value={settings.weeklyBudget}
          onChange={e => setSettings(s => ({ ...s, weeklyBudget: Number(e.target.value) }))}
          className="w-full accent-green-500" />
        <div className="flex justify-between text-xs text-zinc-600">
          <span>£10</span><span>£500</span>
        </div>
      </div>

      {/* DCA day */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Weekly buy day</p>
        <div className="flex gap-2">
          {DAYS.map((d, i) => (
            <button key={d} onClick={() => setSettings(s => ({ ...s, dcaDay: i }))}
              className={`flex-1 py-2 rounded-lg text-sm border transition-all ${
                settings.dcaDay === i
                  ? 'bg-green-900/50 border-green-600/50 text-green-300 font-medium'
                  : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
              }`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleSave}
        className="w-full py-3 bg-green-700 hover:bg-green-600 rounded-xl text-sm font-semibold text-white transition-colors">
        {saved ? '✓ Saved!' : 'Save settings'}
      </button>

      <p className="text-xs text-zinc-700">
        Keys stored only in your browser (localStorage). Never sent to any server except Trading 212 via the proxy.
      </p>
    </div>
  )
}
