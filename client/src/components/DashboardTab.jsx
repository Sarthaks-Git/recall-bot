import React from 'react'
import { Calendar, CalendarDays, CheckCircle2, AlertCircle, Layers, Check, Trash2, Undo2 } from 'lucide-react'

// Sub-component for individual tasks
export const TaskCard = ({ task, onStatusChange, onDelete }) => {
  const isDone = task.status === 'done';
  const tagColor = 
    task.type === 'assignment' ? 'var(--blue)' : 
    task.type === 'exam' ? 'var(--red)' : 
    task.type === 'quiz' ? 'var(--orange)' : 
    task.type === 'lab' ? 'var(--green)' : 'var(--text-muted)';
    
  const getDaysText = (days) => {
    if (days < -1) return `${Math.abs(days)} days OVERDUE`
    if (days === -1) return "1 day OVERDUE"
    if (days === 0) return "TODAY"
    if (days === 1) return "Tomorrow"
    return `${days} days left`
  }
  
  const dueClass = task.daysLeft < 0 ? "due-urgent" : task.daysLeft <= 1 ? "due-soon" : task.daysLeft <= 3 ? "due-soon" : "due-ok"

  return (
    <div className={`task-item ${isDone ? 'is-done' : ''}`}>
      <div className={`task-priority-indicator ${
        isDone ? 'priority-done' : 
        task.priority === 'urgent' || task.daysLeft < 0 ? 'priority-urgent' : 
        task.priority === 'important' ? 'priority-important' : 'priority-normal'
      }`} />
      
      <div className="task-content">
        {task.link ? (
          <a href={task.link} target="_blank" rel="noopener noreferrer" className="task-title">
            {task.title}
          </a>
        ) : (
          <div className="task-title">{task.title}</div>
        )}
        
        {task.summary && <div className="task-summary">{task.summary}</div>}
        
        <div className="task-meta">
          <span className="badge" style={{ backgroundColor: `${tagColor}20`, color: tagColor }}>
             {task.type || 'other'}
          </span>
          <span className={`task-due ${dueClass}`}>
            <Calendar size={12} style={{marginRight: 4}}/> 
            {task.due} ({getDaysText(task.daysLeft)})
          </span>
          <span className="badge badge-source">
            {task.source === 'classroom' ? '📚' : '📧'} {task.source}
          </span>
        </div>
      </div>

      <div className="task-actions">
        {onStatusChange && (
          <button 
            className={`action-icon ${isDone ? '' : 'action-check'}`}
            onClick={() => onStatusChange(task.id, isDone ? 'pending' : 'done')}
            title={isDone ? "Mark Pending" : "Mark Done"}
          >
            {isDone ? <Undo2 size={16} /> : <Check size={16} />}
          </button>
        )}
        {onDelete && (
          <button 
            className="action-icon action-delete" 
            onClick={() => onDelete(task.id)}
            title="Delete Task"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function DashboardTab({ tasks, stats, triggerScan, sendDigest, setActiveTab }) {
  if (!stats) return <div className="p-8">Loading...</div>

  const urgentTasks = tasks
    .filter(t => t.status === 'pending' && t.daysLeft >= 0 && t.daysLeft <= 2)
    .slice(0, 5)

  // Quick stat card component
  const StatCard = ({ icon: Icon, value, label, colorClass }) => (
    <div className={`stat-card ${colorClass}`}>
      <div className="stat-icon"><Icon size={24} /></div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )

  return (
    <div className="tab-content active">
      <div className="page-header">
        <div>
          <h2 className="page-title text-gradient">Dashboard</h2>
          <p id="greeting">Good day! Here's your academic overview.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => sendDigest('morning')}>
             📱 WhatsApp Digest
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon={AlertCircle} value={stats.urgent} label="Urgent" colorClass="stat-urgent" />
        <StatCard icon={Calendar} value={stats.dueToday} label="Due Today" colorClass="stat-today" />
        <StatCard icon={CalendarDays} value={stats.dueThisWeek} label="This Week" colorClass="stat-week" />
        <StatCard icon={Layers} value={stats.pending} label="Pending Tasks" colorClass="stat-pending" />
      </div>

      <div className="card" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3>🔥 Urgent & Due Soon</h3>
          <button className="btn btn-ghost" onClick={() => setActiveTab('tasks')}>View All →</button>
        </div>
        
        <div className="task-list">
          {urgentTasks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No urgent tasks — you're all caught up! 🎉
            </div>
          ) : (
            urgentTasks.map(task => <TaskCard key={task.id} task={task} />)
          )}
        </div>
      </div>
    </div>
  )
}
