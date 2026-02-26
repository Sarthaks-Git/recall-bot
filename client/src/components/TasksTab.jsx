import React, { useState } from 'react'
import { Search } from 'lucide-react'
import { TaskCard } from './DashboardTab'

export default function TasksTab({ tasks, refresh }) {
  const [filterStatus, setFilterStatus] = useState('pending')
  const [filterType, setFilterType] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const handleStatusChange = async (id, newStatus) => {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    })
    refresh()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this task permanently?')) return
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    refresh()
  }

  let filtered = [...tasks].filter(t => t.status !== 'expired')
  
  if (filterStatus !== 'all') {
    filtered = filtered.filter(t => t.status === filterStatus)
  }
  if (filterType) {
    filtered = filtered.filter(t => t.type === filterType)
  }
  if (searchTerm) {
    const q = searchTerm.toLowerCase()
    filtered = filtered.filter(t => 
      t.title.toLowerCase().includes(q) || 
      (t.summary && t.summary.toLowerCase().includes(q))
    )
  }

  const FilterTab = ({ label, value, current, setter }) => (
    <button 
      className={`filter-tab ${current === value ? 'active' : ''}`}
      onClick={() => setter(current === value ? null : value)}
    >
      {label}
    </button>
  )

  return (
    <div className="tab-content active">
      <div className="page-header">
        <h2 className="page-title text-gradient">All Tasks</h2>
      </div>

      <div className="controls-bar">
        <div className="filter-tabs">
          <FilterTab label="All" value="all" current={filterStatus} setter={setFilterStatus} />
          <FilterTab label="Pending" value="pending" current={filterStatus} setter={setFilterStatus} />
          <FilterTab label="Done" value="done" current={filterStatus} setter={setFilterStatus} />
          
          <div style={{ width: 1, background: 'var(--border-color)', margin: '0 8px' }} />
          
          <FilterTab label="📝 Assignment" value="assignment" current={filterType} setter={setFilterType} />
          <FilterTab label="📖 Exam" value="exam" current={filterType} setter={setFilterType} />
          <FilterTab label="❓ Quiz" value="quiz" current={filterType} setter={setFilterType} />
          <FilterTab label="🔬 Lab" value="lab" current={filterType} setter={setFilterType} />
        </div>

        <div style={{ position: 'relative' }}>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="task-list">
        {filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            No tasks match your filters.
          </div>
        ) : (
          filtered.map(task => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}
