'use client'

import { useState, useEffect } from 'react'
import { loadSettings, saveSettings, T212Settings } from '@/lib/halal/t212'
import { Key, Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'

export default function SettingsPage() {
  const [settings, setSettings] = useState<T212Settings>({
    apiKey: '',
    privateKey: '',
    accountType: 'live',
    weeklyBudget: 50,
    dcaDay: 0,
  })
  const [showKey, setShowKey] = useState(false)
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    setSettings(loadSettings())
  }, [])

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
          // T212 returns various error shapes
          msg = err?.message || err?.error || err?.code || JSON.stringify(err)
        } catch { /* ignore */ }
        if (res.status === 401) {
          msg = `401 Unauthorized — check: (1) is the account type correct? Live key → pick Live, Demo key → pick Demo. (2) did you copy the full key? Original T212 message: ${msg}`
        }
        setTestResult({ ok: false, msg })
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Connection failed' })
    }
    setTesting(false)
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-green-300">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">Connect your Trading 212 account</p>
      </div>

      {/* API Key setup guide */}
      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 space-y-2">
        <p className="text-sm font-medium text-blue-300">How to get your T212 API key</p>
        <ol className="text-xs text-zinc-400 space-y-1 list-decimal list-inside">
          <li>Open Trading 212 app or website</li>
          <li>Go to Settings → API (bottom of menu)</li>
          <li>Generate a new API key</li>
          <li>Copy and paste it below</li>
        </ol>
        <a
          href="https://www.trading212.com/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Open T212 API settings <ExternalLink size={10} />
        </a>
      </div>

      {/* Account type */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-3">
        <label className="text-sm font-medium text-zinc-200">Account type</label>
        <p className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800/30 rounded-lg px-3 py-2">
          ⚠ This must match your API key. If you generated the key from your real T212 account, choose <strong>Live</strong>. If from the practice/demo account, choose <strong>Demo</strong>. Mismatch = 401 error.
        </p>
        <div className="flex gap-3">
          {(['live', 'demo'] as const).map(type => (
            <button
              key={type}
              onClick={() => setSettings(s => ({ ...s, accountType: type }))}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                settings.accountType === type
                  ? type === 'live'
                    ? 'bg-green-900/50 border-green-600/50 text-green-300'
                    : 'bg-blue-900/50 border-blue-600/50 text-blue-300'
                  : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {type === 'live' ? '🔴 Live (real money)' : '🔵 Demo (practice)'}
            </button>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-4">
        <label className="text-sm font-medium text-zinc-200 flex items-center gap-2">
          <Key size={14} className="text-green-400" />
          API Key &amp; Private Key
        </label>

        <div className="space-y-2">
          <p className="text-xs text-zinc-500">API Key</p>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))}
              placeholder="Paste your T212 API key"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-green-600"
            />
            <button
              onClick={() => setShowKey(v => !v)}
              className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Private Key</p>
          <div className="flex gap-2">
            <input
              type={showPrivateKey ? 'text' : 'password'}
              value={settings.privateKey}
              onChange={e => setSettings(s => ({ ...s, privateKey: e.target.value }))}
              placeholder="Paste your T212 private key"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-green-600"
            />
            <button
              onClick={() => setShowPrivateKey(v => !v)}
              className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {showPrivateKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={!settings.apiKey || testing}
            className="px-4 py-2 bg-blue-900/50 border border-blue-700/50 text-blue-300 rounded-lg text-sm hover:bg-blue-900/70 transition-colors disabled:opacity-40"
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {testResult && (
          <div
            className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
              testResult.ok
                ? 'bg-green-900/30 border border-green-700/30 text-green-300'
                : 'bg-red-900/30 border border-red-700/30 text-red-300'
            }`}
          >
            {testResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {testResult.msg}
          </div>
        )}
      </div>

      {/* Weekly budget */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-3">
        <label className="text-sm font-medium text-zinc-200">
          Weekly investment budget: <span className="text-green-300">£{settings.weeklyBudget}</span>
        </label>
        <input
          type="range"
          min={10}
          max={200}
          step={5}
          value={settings.weeklyBudget}
          onChange={e => setSettings(s => ({ ...s, weeklyBudget: Number(e.target.value) }))}
          className="w-full accent-green-500"
        />
        <div className="flex justify-between text-xs text-zinc-500">
          <span>£10</span>
          <span>£200</span>
        </div>
      </div>

      {/* DCA day */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-3">
        <label className="text-sm font-medium text-zinc-200">Weekly buy day</label>
        <div className="flex gap-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => (
            <button
              key={day}
              onClick={() => setSettings(s => ({ ...s, dcaDay: i }))}
              className={`flex-1 py-2 rounded-lg text-sm border transition-all ${
                settings.dcaDay === i
                  ? 'bg-green-900/50 border-green-600/50 text-green-300 font-medium'
                  : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full py-3 bg-green-700 hover:bg-green-600 rounded-xl text-sm font-semibold text-white transition-colors"
      >
        {saved ? '✓ Saved!' : 'Save settings'}
      </button>

      <p className="text-xs text-zinc-600">
        Your API key is stored only in your browser (localStorage). It is never sent to any server
        except Trading 212 via the proxy route.
      </p>
    </div>
  )
}
