import React, { useState, useEffect } from 'react'
import { Save } from 'lucide-react'

export default function SettingsTab() {
  const [config, setConfig] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      const data = await res.json()
      if (data.success) {
        alert("✅ Settings saved successfully!")
      } else {
        alert("❌ Failed to save settings")
      }
    } catch (err) {
      alert("❌ Failed to save settings")
    }
    setSaving(false)
  }

  const parseArray = (str) => str.split('\n').map(s => s.trim()).filter(s => s.length > 0)
  const joinArray = (arr) => (arr || []).join('\n')

  const updateConfig = (section, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }))
  }

  const toggleSource = (source) => {
    const sources = config.scanning.sources || []
    const newSources = sources.includes(source) 
      ? sources.filter(s => s !== source) 
      : [...sources, source]
    updateConfig('scanning', 'sources', newSources)
  }

  if (!config) return <div className="p-8 color-muted">Loading settings...</div>

  return (
    <div className="tab-content active" style={{ maxWidth: 1000 }}>
      <div className="page-header">
        <h2 className="page-title text-gradient">Settings</h2>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="settings-grid">
        {/* Keywords */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>✅ Whitelist Keywords</h3>
          <p className="form-desc">Emails matching these keywords will be tracked (one per line).</p>
          <textarea 
            className="form-control"
            value={joinArray(config.whitelist?.keywords)}
            onChange={(e) => updateConfig('whitelist', 'keywords', parseArray(e.target.value))}
          />
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>🚫 Blacklist Keywords</h3>
          <p className="form-desc">Emails matching these will be ignored (one per line).</p>
          <textarea 
            className="form-control"
            value={joinArray(config.blacklist?.keywords)}
            onChange={(e) => updateConfig('blacklist', 'keywords', parseArray(e.target.value))}
          />
        </div>

        {/* Senders */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>📧 Whitelisted Senders</h3>
          <textarea 
            className="form-control"
            value={joinArray(config.whitelist?.senders)}
            onChange={(e) => updateConfig('whitelist', 'senders', parseArray(e.target.value))}
          />
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>🚫 Blacklisted Senders</h3>
          <textarea 
            className="form-control"
            value={joinArray(config.blacklist?.senders)}
            onChange={(e) => updateConfig('blacklist', 'senders', parseArray(e.target.value))}
          />
        </div>

        {/* Reminders */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>⏰ Reminder Times</h3>
          <p className="form-desc">When to send WhatsApp messages.</p>
          
          <div className="form-group" style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Morning</label>
              <input 
                type="time" 
                className="form-control" 
                value={config.reminders?.morning || ''}
                onChange={(e) => updateConfig('reminders', 'morning', e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Evening</label>
              <input 
                type="time" 
                className="form-control" 
                value={config.reminders?.evening || ''}
                onChange={(e) => updateConfig('reminders', 'evening', e.target.value)}
              />
            </div>
          </div>
          
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={config.reminders?.enabled !== false}
              onChange={(e) => updateConfig('reminders', 'enabled', e.target.checked)}
            />
            <div className="toggle-slider"></div>
            <span style={{ fontWeight: 500 }}>Reminders Enabled</span>
          </label>
        </div>

        {/* Scanning */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>🔍 Scanning Config</h3>
          
          <div className="form-group" style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Max Emails</label>
              <input 
                type="number" 
                className="form-control" 
                value={config.scanning?.maxEmails || 25}
                onChange={(e) => updateConfig('scanning', 'maxEmails', parseInt(e.target.value))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Interval (mins)</label>
              <input 
                type="number" 
                className="form-control" 
                value={config.scanning?.scanIntervalMinutes || 60}
                onChange={(e) => updateConfig('scanning', 'scanIntervalMinutes', parseInt(e.target.value))}
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={(config.scanning?.sources || []).includes('gmail')}
                onChange={() => toggleSource('gmail')}
              />
              <div className="toggle-slider"></div>
              <span style={{ fontWeight: 500 }}>Scan Gmail</span>
            </label>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={(config.scanning?.sources || []).includes('classroom')}
                onChange={() => toggleSource('classroom')}
              />
              <div className="toggle-slider"></div>
              <span style={{ fontWeight: 500 }}>Scan Google Classroom</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
