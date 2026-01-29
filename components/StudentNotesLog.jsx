/**
 * StudentNotesLog.jsx
 * Structured note-taking component for GradTrack counselors
 * 
 * Features:
 * - Chronological log with timestamps
 * - Note type categorization with visual badges
 * - Follow-up date scheduling
 * - Status tracking (open/completed)
 * - Filter by note type
 * 
 * Usage:
 * <StudentNotesLog 
 *   studentId={student.id} 
 *   counselorId={counselor.id}
 *   studentName="Landon St Aubin"
 * />
 */

import { useState, useEffect } from 'react';
import { supabase } from './supabase'; // Adjust path as needed

// Note type configuration with icons and colors
const NOTE_TYPES = {
  meeting: {
    label: 'In-Person Meeting',
    icon: '👥',
    bgColor: 'bg-emerald-500/20',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30'
  },
  phone_call: {
    label: 'Phone Call',
    icon: '📞',
    bgColor: 'bg-blue-500/20',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/30'
  },
  email: {
    label: 'Email',
    icon: '📧',
    bgColor: 'bg-violet-500/20',
    textColor: 'text-violet-400',
    borderColor: 'border-violet-500/30'
  },
  parent_contact: {
    label: 'Parent Contact',
    icon: '👨‍👩‍👧',
    bgColor: 'bg-amber-500/20',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/30'
  },
  intervention: {
    label: 'Intervention',
    icon: '⚠️',
    bgColor: 'bg-red-500/20',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/30'
  },
  follow_up: {
    label: 'Follow-up',
    icon: '📋',
    bgColor: 'bg-cyan-500/20',
    textColor: 'text-cyan-400',
    borderColor: 'border-cyan-500/30'
  },
  general: {
    label: 'General Note',
    icon: '📝',
    bgColor: 'bg-slate-500/20',
    textColor: 'text-slate-400',
    borderColor: 'border-slate-500/30'
  }
};

// Format date for display
const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

// Format full timestamp for tooltip
const formatFullTimestamp = (dateString) => {
  return new Date(dateString).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

// Note Type Badge Component
const NoteTypeBadge = ({ type }) => {
  const config = NOTE_TYPES[type] || NOTE_TYPES.general;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor} border ${config.borderColor}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};

// Status Badge Component
const StatusBadge = ({ status, onClick }) => {
  const isOpen = status === 'open';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium transition-all hover:scale-105 ${
        isOpen 
          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30' 
          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
      }`}
      title={`Click to mark as ${isOpen ? 'completed' : 'open'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      {isOpen ? 'Open' : 'Completed'}
    </button>
  );
};

// Single Note Entry Component
const NoteEntry = ({ note, onStatusToggle, onDelete }) => {
  const [showFullDate, setShowFullDate] = useState(false);

  return (
    <div className="group relative pl-6 pb-6 border-l-2 border-slate-700 last:border-l-transparent last:pb-0">
      {/* Timeline dot */}
      <div className="absolute left-0 top-0 w-3 h-3 -translate-x-[7px] rounded-full bg-slate-700 border-2 border-slate-800 group-hover:bg-cyan-500 group-hover:border-cyan-500/50 transition-colors" />
      
      {/* Note card */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 hover:border-slate-600/50 transition-colors">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <NoteTypeBadge type={note.note_type} />
            <StatusBadge 
              status={note.status} 
              onClick={() => onStatusToggle(note.id, note.status)}
            />
          </div>
          
          {/* Timestamp */}
          <div 
            className="text-xs text-slate-500 cursor-help"
            onMouseEnter={() => setShowFullDate(true)}
            onMouseLeave={() => setShowFullDate(false)}
            title={formatFullTimestamp(note.created_at)}
          >
            {showFullDate ? formatFullTimestamp(note.created_at) : formatDate(note.created_at)}
          </div>
        </div>

        {/* Note content */}
        <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
          {note.content}
        </p>

        {/* Follow-up date if set */}
        {note.follow_up_date && (
          <div className={`mt-3 flex items-center gap-2 text-xs ${
            new Date(note.follow_up_date) < new Date() && note.status === 'open'
              ? 'text-red-400'
              : 'text-slate-500'
          }`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Follow-up: {new Date(note.follow_up_date).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })}
            {new Date(note.follow_up_date) < new Date() && note.status === 'open' && (
              <span className="text-red-400 font-medium">(Overdue)</span>
            )}
          </div>
        )}

        {/* Delete button (appears on hover) */}
        <button
          onClick={() => onDelete(note.id)}
          className="absolute top-2 right-2 p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
          title="Delete note"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// New Note Form Component
const NewNoteForm = ({ onSubmit, isSubmitting }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [noteType, setNoteType] = useState('general');
  const [content, setContent] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    await onSubmit({
      note_type: noteType,
      content: content.trim(),
      follow_up_date: followUpDate || null,
      status: 'open'
    });

    // Reset form
    setContent('');
    setFollowUpDate('');
    setNoteType('general');
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800/30 text-slate-500 hover:text-cyan-400 transition-all group"
      >
        <div className="w-8 h-8 rounded-full bg-slate-800 group-hover:bg-cyan-500/20 flex items-center justify-center transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <span className="font-medium">Add Note</span>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/70 rounded-lg border border-slate-700 p-4">
      {/* Note Type Selection */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-400 mb-2">Note Type</label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(NOTE_TYPES).map(([key, config]) => (
            <button
              key={key}
              type="button"
              onClick={() => setNoteType(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                noteType === key
                  ? `${config.bgColor} ${config.textColor} border-2 ${config.borderColor}`
                  : 'bg-slate-700/50 text-slate-400 border-2 border-transparent hover:bg-slate-700'
              }`}
            >
              <span>{config.icon}</span>
              <span>{config.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Note Content */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-400 mb-2">Note Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Enter your note..."
          rows={4}
          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 resize-none"
          autoFocus
        />
      </div>

      {/* Follow-up Date */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-400 mb-2">
          Follow-up Date <span className="text-slate-600">(optional)</span>
        </label>
        <input
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
        />
      </div>

      {/* Form Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!content.trim() || isSubmitting}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save Note
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsExpanded(false);
            setContent('');
            setFollowUpDate('');
            setNoteType('general');
          }}
          className="px-4 py-2 text-slate-400 hover:text-slate-300 font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

// Filter Tabs Component
const FilterTabs = ({ activeFilter, onFilterChange, noteCounts }) => {
  const filters = [
    { key: 'all', label: 'All Notes' },
    { key: 'open', label: 'Open' },
    { key: 'meeting', label: '👥 Meetings' },
    { key: 'intervention', label: '⚠️ Interventions' },
    { key: 'parent_contact', label: '👨‍👩‍👧 Parent' },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {filters.map(filter => {
        const count = filter.key === 'all' 
          ? noteCounts.total 
          : filter.key === 'open'
            ? noteCounts.open
            : noteCounts.byType[filter.key] || 0;
        
        return (
          <button
            key={filter.key}
            onClick={() => onFilterChange(filter.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeFilter === filter.key
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
            }`}
          >
            {filter.label}
            {count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${
                activeFilter === filter.key
                  ? 'bg-cyan-500/30 text-cyan-100'
                  : 'bg-slate-700 text-slate-500'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// Main StudentNotesLog Component
const StudentNotesLog = ({ studentId, counselorId, studentName = 'Student' }) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  // Fetch notes from database
  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('student_notes')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (err) {
      console.error('Error fetching notes:', err);
      setError('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (studentId) {
      fetchNotes();
    }
  }, [studentId]);

  // Add new note
  const handleAddNote = async (noteData) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('student_notes')
        .insert([{
          student_id: studentId,
          counselor_id: counselorId,
          ...noteData
        }])
        .select()
        .single();

      if (error) throw error;
      setNotes(prev => [data, ...prev]);
    } catch (err) {
      console.error('Error adding note:', err);
      setError('Failed to add note');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle note status
  const handleStatusToggle = async (noteId, currentStatus) => {
    const newStatus = currentStatus === 'open' ? 'completed' : 'open';
    try {
      const { error } = await supabase
        .from('student_notes')
        .update({ status: newStatus })
        .eq('id', noteId);

      if (error) throw error;
      setNotes(prev => prev.map(note => 
        note.id === noteId ? { ...note, status: newStatus } : note
      ));
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Delete note
  const handleDeleteNote = async (noteId) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    
    try {
      const { error } = await supabase
        .from('student_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      setNotes(prev => prev.filter(note => note.id !== noteId));
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  // Calculate note counts for filters
  const noteCounts = {
    total: notes.length,
    open: notes.filter(n => n.status === 'open').length,
    byType: notes.reduce((acc, note) => {
      acc[note.note_type] = (acc[note.note_type] || 0) + 1;
      return acc;
    }, {})
  };

  // Filter notes based on active filter
  const filteredNotes = notes.filter(note => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'open') return note.status === 'open';
    return note.note_type === activeFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">
          Notes for {studentName}
        </h3>
        <span className="text-sm text-slate-500">
          {notes.length} {notes.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Add Note Form */}
      <NewNoteForm onSubmit={handleAddNote} isSubmitting={isSubmitting} />

      {/* Filter Tabs */}
      {notes.length > 0 && (
        <FilterTabs 
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          noteCounts={noteCounts}
        />
      )}

      {/* Notes Timeline */}
      {filteredNotes.length > 0 ? (
        <div className="mt-6">
          {filteredNotes.map(note => (
            <NoteEntry
              key={note.id}
              note={note}
              onStatusToggle={handleStatusToggle}
              onDelete={handleDeleteNote}
            />
          ))}
        </div>
      ) : notes.length > 0 ? (
        <div className="text-center py-8 text-slate-500">
          No notes match the current filter
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <p className="mb-2">No notes yet</p>
          <p className="text-sm">Add your first note to start tracking interactions</p>
        </div>
      )}
    </div>
  );
};

export default StudentNotesLog;
