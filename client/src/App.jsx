import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  ListTodo,
  Settings,
  Search,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  Calendar,
  Layers,
  SearchCheck,
  Smartphone,
  BookOpen
} from 'lucide-react'

// Replace with individual component imports as we build them
import DashboardTab from './components/DashboardTab'
import TasksTab from './components/TasksTab'
import SettingsTab from './components/SettingsTab'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [tasks, setTasks] = useState([])
  const [stats, setStats] = useState(null)
  const [scanStatus, setScanStatus] = useState(null)
  const [authStatus, setAuthStatus] = useState({ authorized: true })
  
  // Refresh Data
  const loadData = async () => {
    try {
      const [tasksRes, statsRes, scanRes, authRes] = await Promise.all([
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/stats').then(r => r.json()),
        fetch('/api/scan/status').then(r => r.json()),
        fetch('/api/auth/status').then(r => r.json())
      ])
      
      setTasks(tasksRes)
      setStats(statsRes)
      setScanStatus(scanRes)
      setAuthStatus(authRes)
    } catch (err) {
      console.error("Failed to load dashboard data:", err)
    }
  }

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 30000) // 30s polling
    return () => clearInterval(timer)
  }, [])

  const triggerScan = async () => {
    if (scanStatus?.isScanning) return
    setScanStatus({ ...scanStatus, isScanning: true })
    try {
      await fetch('/api/scan', { method: 'POST' })
      // Start intense polling while scanning
      const poll = setInterval(async () => {
        const res = await fetch('/api/scan/status').then(r => r.json())
        setScanStatus(res)
        if (!res.isScanning) {
          clearInterval(poll)
          loadData()
        }
      }, 2000)
    } catch (err) {
      console.error(err)
      setScanStatus({ ...scanStatus, isScanning: false })
    }
  }

  const sendDigest = async (time) => {
    try {
      await fetch(`/api/digest/${time}`, { method: 'POST' })
      alert(`✅ ${time} digest sent successfully!`)
    } catch (err) {
      alert("❌ Failed to send digest")
    }
  }

  return (
    <>
      {/* ─── Sidebar ─── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo"><SearchCheck size={20} /></div>
          <div>
            <div className="sidebar-title">RecallBot</div>
            <div className="sidebar-version">v2.0 React</div>
          </div>
        </div>

        <nav className="nav-menu">
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button 
            className={`nav-item ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            <ListTodo size={18} /> Tasks
            {stats?.pending > 0 && <span className="nav-badge">{stats.pending}</span>}
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} /> Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: 'center', marginBottom: '12px' }}
            onClick={triggerScan}
            disabled={scanStatus?.isScanning}
          >
            <Search size={16} /> {scanStatus?.isScanning ? 'Scanning...' : 'Scan Now'}
          </button>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
            Last scan: {scanStatus?.lastScanTime ? new Date(scanStatus.lastScanTime).toLocaleTimeString() : 'Never'}
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="main-content">
        {!authStatus.authorized && (
          <div className="alert-banner">
            <div>
              <div className="alert-title">⚠️ Google Connection Required</div>
              <div className="alert-desc">RecallBot needs access to verify new tasks from Gmail and Classroom.</div>
            </div>
            <a href="/auth/google" className="btn btn-primary" style={{ background: 'var(--orange)', color: '#000' }}>
              Connect Google Account
            </a>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab 
            tasks={tasks} 
            stats={stats} 
            triggerScan={triggerScan}
            sendDigest={sendDigest}
            setActiveTab={setActiveTab}
          />
        )}
        
        {activeTab === 'tasks' && (
          <TasksTab tasks={tasks} refresh={loadData} />
        )}

        {activeTab === 'settings' && (
          <SettingsTab />
        )}
      </main>
    </>
  )
}

export default App
