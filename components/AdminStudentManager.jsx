import { useState, useEffect, useCallback } from 'react';
import { supabaseUrl, supabaseAnonKey } from '../supabase';

const CURRENT_SCHOOL_YEAR = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;

function getGradeLevel(graduationYear) {
  if (!graduationYear) return null;
  const grade = 12 - (graduationYear - (CURRENT_SCHOOL_YEAR + 1));
  if (grade < 1) return null;
  // Cap at 12 for "super seniors" — students past their original
  // graduation year who are still actively enrolled. Common for
  // asynch virtual schools where students complete courses on
  // their own timeline.
  return Math.min(grade, 12);
}

function getGradYearFromGrade(grade) {
  return CURRENT_SCHOOL_YEAR + 1 + (12 - grade);
}

const DIPLOMA_TYPES = [
  { code: 'STANDARD_2026', label: 'Oregon Standard 2026' },
  { code: 'STANDARD_2027', label: 'Oregon Standard 2027' },
  { code: 'HONORS_2026', label: 'Oregon Honors 2026' },
  { code: 'HONORS_2027', label: 'Oregon Honors 2027' },
  { code: 'MODIFIED_2026', label: 'Oregon Modified 2026' },
  { code: 'MODIFIED_2027', label: 'Oregon Modified 2027' },
];

const EMPTY_FORM = {
  full_name: '',
  preferred_name: '',
  email: '',
  graduation_year: getGradYearFromGrade(9),
  student_id_local: '',
  has_iep: false,
  has_504: false,
  is_ell: false,
  is_ged: false,
  is_adult_student: false,
  diploma_type_id: '',
  counselor_id: '',
};

function directFetch(path, options = {}) {
  const token = (() => {
    try {
      const raw = localStorage.getItem(`sb-vstiweftxjaszhnjwggb-auth-token`);
      return raw ? JSON.parse(raw)?.access_token : null;
    } catch { return null; }
  })();
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${token}`,
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
  });
}

export default function AdminStudentManager({ schoolId, profile, onViewStudent }) {
  const [students, setStudents] = useState([]);
  const [counselors, setCounselors] = useState([]);
  const [diplomaTypes, setDiplomaTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [counselorFilter, setCounselorFilter] = useState('all');

  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'archive'
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch students
      const sRes = await directFetch(
        `profiles?school_id=eq.${schoolId}&role=eq.student&is_active=eq.true&select=*&order=full_name.asc&limit=2000`
      );
      const sData = sRes.ok ? await sRes.json() : [];

      // Fetch counselor AND case_manager assignments so both appear in the
      // filter dropdown and students show under their assigned advisor.
      const studentIds = sData.map(s => s.id);
      const counselorMap = {};
      for (let i = 0; i < studentIds.length; i += 50) {
        const batch = studentIds.slice(i, i + 50);
        const ids = batch.map(id => `"${id}"`).join(',');
        const cRes = await directFetch(
          `counselor_assignments?student_id=in.(${ids})&school_id=eq.${schoolId}&select=student_id,counselor_id`
        );
        if (cRes.ok) {
          const cData = await cRes.json();
          cData.forEach(a => { counselorMap[a.student_id] = a.counselor_id; });
        }
      }
      sData.forEach(s => { s.counselor_id = counselorMap[s.id] || null; });
      setStudents(sData);

      // Fetch counselors
      const coRes = await directFetch(
        `profiles?school_id=eq.${schoolId}&role=in.(counselor,case_manager)&is_active=eq.true&select=id,full_name,role&order=full_name.asc`
      );
      if (coRes.ok) setCounselors(await coRes.json());

      // Fetch diploma types
      const dRes = await directFetch(`diploma_types?school_id=eq.${schoolId}&select=id,name,code`);
      if (dRes.ok) setDiplomaTypes(await dRes.json());
    } catch (e) {
      console.error('Student roster load failed');
    }
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = students.filter(s => {
    const matchesSearch = !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.student_id_local?.includes(search);
    const matchesGrade = gradeFilter === 'all' || String(s.grade) === gradeFilter;
    const matchesCounselor = counselorFilter === 'all' || s.counselor_id === counselorFilter;
    return matchesSearch && matchesGrade && matchesCounselor;
  });

  function openAdd() {
    setForm(EMPTY_FORM);
    setError('');
    setModal('add');
  }

  function openEdit(student) {
    setSelectedStudent(student);
    setForm({
      full_name: student.full_name || '',
      preferred_name: student.preferred_name || '',
      email: student.email || '',
      graduation_year: student.graduation_year || getGradYearFromGrade(9),
      student_id_local: student.student_id_local || '',
      has_iep: !!student.has_iep,
      has_504: !!student.has_504,
      is_ell: !!student.is_ell,
      is_ged: !!student.is_ged,
      is_adult_student: !!student.is_adult_student,
      diploma_type_id: student.diploma_type_id || '',
      counselor_id: student.counselor_id || '',
    });
    setError('');
    setModal('edit');
  }

  function openArchive(student) {
    setSelectedStudent(student);
    setModal('archive');
  }

  function closeModal() {
    setModal(null);
    setSelectedStudent(null);
    setError('');
  }

  function flash(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3500);
  }

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Full name is required.'); return; }
    if (!form.email.trim()) { setError('Email is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'add') {
        // Create auth user via admin API isn't available client-side,
        // so we insert a profile row directly. The student will sign up themselves.
        const payload = {
          school_id: schoolId,
          role: 'student',
          full_name: form.full_name.trim(),
          preferred_name: form.preferred_name.trim() || null,
          email: form.email.trim().toLowerCase(),
          graduation_year: Number(form.graduation_year),
          student_id_local: form.student_id_local.trim() || null,
          has_iep: form.has_iep,
          has_504: form.has_504,
          is_ell: form.is_ell,
          is_ged: form.is_ged,
          is_adult_student: form.is_adult_student,
          diploma_type_id: form.diploma_type_id || null,
          is_active: true,
        };
        const res = await directFetch('profiles', {
          method: 'POST',
          body: JSON.stringify(payload),
          prefer: 'return=representation',
        });
        if (!res.ok) {
          const err = await res.json();
          setError(err.message || 'Failed to create student.');
          setSaving(false); return;
        }
        const [newStudent] = await res.json();
        // Assign counselor if selected
        if (form.counselor_id && newStudent?.id) {
          await directFetch('counselor_assignments', {
            method: 'POST',
            body: JSON.stringify({
              student_id: newStudent.id,
              counselor_id: form.counselor_id,
              school_id: schoolId,
              assignment_type: 'counselor',
            }),
            prefer: 'return=minimal',
          });
        }
        flash('Student added successfully.');
      } else if (modal === 'edit') {
        const payload = {
          full_name: form.full_name.trim(),
          preferred_name: form.preferred_name.trim() || null,
          email: form.email.trim().toLowerCase(),
          graduation_year: Number(form.graduation_year),
          student_id_local: form.student_id_local.trim() || null,
          has_iep: form.has_iep,
          has_504: form.has_504,
          is_ell: form.is_ell,
          is_ged: form.is_ged,
          is_adult_student: form.is_adult_student,
          diploma_type_id: form.diploma_type_id || null,
        };
        const res = await directFetch(`profiles?id=eq.${selectedStudent.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
          prefer: 'return=minimal',
        });
        if (!res.ok) { setError('Failed to update student.'); setSaving(false); return; }

        // Update counselor assignment
        if (form.counselor_id !== selectedStudent.counselor_id) {
          // Delete old assignment
          await directFetch(
            `counselor_assignments?student_id=eq.${selectedStudent.id}&school_id=eq.${schoolId}&assignment_type=eq.counselor`,
            { method: 'DELETE', prefer: 'return=minimal' }
          );
          // Insert new one if selected
          if (form.counselor_id) {
            await directFetch('counselor_assignments', {
              method: 'POST',
              body: JSON.stringify({
                student_id: selectedStudent.id,
                counselor_id: form.counselor_id,
                school_id: schoolId,
                assignment_type: 'counselor',
              }),
              prefer: 'return=minimal',
            });
          }
        }
        flash('Student updated successfully.');
      }
      await fetchAll();
      closeModal();
    } catch (e) {
      setError('An unexpected error occurred.');
    }
    setSaving(false);
  }

  async function handleArchive() {
    setSaving(true);
    try {
      const res = await directFetch(`profiles?id=eq.${selectedStudent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false, withdrawal_date: new Date().toISOString().split('T')[0] }),
        prefer: 'return=minimal',
      });
      if (!res.ok) { setError('Failed to archive student.'); setSaving(false); return; }
      flash(`${selectedStudent.full_name} has been archived.`);
      await fetchAll();
      closeModal();
    } catch (e) {
      setError('An unexpected error occurred.');
    }
    setSaving(false);
  }

  const grades = [...new Set(students.map(s => s.grade).filter(Boolean))].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {/* Success toast */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in">
          ✓ {successMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white">Student Roster</h2>
          <p className="text-slate-400 text-sm">{students.length} active students</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <span className="text-base">+</span> Add Student
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search name, email, or ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-slate-800 text-white placeholder-slate-500 border border-slate-700 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={gradeFilter}
          onChange={e => setGradeFilter(e.target.value)}
          className="bg-slate-800 text-white border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        >
          <option value="all">All Grades</option>
          {grades.map(g => <option key={g} value={String(g)}>Grade {g}</option>)}
        </select>
        <select
          value={counselorFilter}
          onChange={e => setCounselorFilter(e.target.value)}
          className="bg-slate-800 text-white border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        >
          <option value="all">All Counselors</option>
          {counselors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">Loading students...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Grade</th>
                <th className="px-4 py-3 font-medium">Counselor</th>
                <th className="px-4 py-3 font-medium">Flags</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No students match your filters.
                  </td>
                </tr>
              ) : filtered.map(s => {
                const counselor = counselors.find(c => c.id === s.counselor_id);
                return (
                  <tr key={s.id} className="bg-slate-900 hover:bg-slate-800/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{s.full_name}</div>
                      <div className="text-slate-500 text-xs">{s.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{s.student_id_local || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{s.grade || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{counselor?.full_name || <span className="text-slate-600">Unassigned</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.has_iep && <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">IEP</span>}
                        {s.has_504 && <span className="bg-purple-500/20 text-purple-400 text-xs px-2 py-0.5 rounded-full">504</span>}
                        {s.is_ell && <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">ELL</span>}
                        {s.is_ged && <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">GED</span>}
                        {s.is_adult_student && <span className="bg-slate-500/20 text-slate-400 text-xs px-2 py-0.5 rounded-full">Adult</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        {onViewStudent && (
                          <button
                            onClick={() => onViewStudent(s)}
                            className="text-slate-400 hover:text-emerald-400 transition-colors text-xs px-2 py-1 rounded hover:bg-emerald-500/10"
                          >
                            👁 View
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(s)}
                          className="text-slate-400 hover:text-indigo-400 transition-colors text-xs px-2 py-1 rounded hover:bg-indigo-500/10"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => openArchive(s)}
                          className="text-slate-400 hover:text-rose-400 transition-colors text-xs px-2 py-1 rounded hover:bg-rose-500/10"
                        >
                          📦 Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-800">
              <h3 className="text-white font-semibold text-lg">
                {modal === 'add' ? 'Add New Student' : `Edit — ${selectedStudent?.full_name}`}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {/* Name + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-400 text-xs mb-1">Full Name *</label>
                  <input
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="First Last"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-400 text-xs mb-1">Preferred Name <span className="text-slate-600">(nickname, optional)</span></label>
                  <input
                    value={form.preferred_name}
                    onChange={e => setForm(f => ({ ...f, preferred_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Jordan"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-400 text-xs mb-1">Email *</label>
                  <input
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="student@summitlc.org"
                  />
                </div>
              </div>

              {/* Grade + Student ID */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Grade</label>
                  <select
                    value={12 - (form.graduation_year - (CURRENT_SCHOOL_YEAR + 1))}
                    onChange={e => setForm(f => ({ ...f, graduation_year: getGradYearFromGrade(Number(e.target.value)) }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    {[9, 10, 11, 12].map(g => <option key={g} value={g}>Grade {g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Student ID (Local)</label>
                  <input
                    value={form.student_id_local}
                    onChange={e => setForm(f => ({ ...f, student_id_local: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. 31672"
                  />
                </div>
              </div>

              {/* Counselor + Diploma */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Counselor</label>
                  <select
                    value={form.counselor_id}
                    onChange={e => setForm(f => ({ ...f, counselor_id: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Unassigned</option>
                    {counselors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Diploma Type</label>
                  <select
                    value={form.diploma_type_id}
                    onChange={e => setForm(f => ({ ...f, diploma_type_id: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Not set</option>
                    {diplomaTypes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Flags */}
              <div>
                <label className="block text-slate-400 text-xs mb-2">Flags</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'has_iep', label: '🔵 IEP' },
                    { key: 'has_504', label: '🟣 504' },
                    { key: 'is_ell', label: '🟢 ELL' },
                    { key: 'is_ged', label: '🟡 GED' },
                    { key: 'is_adult_student', label: '⚪ Adult Student' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                        className="w-4 h-4 rounded accent-indigo-500"
                      />
                      <span className="text-slate-300 text-sm group-hover:text-white transition-colors">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-rose-400 text-sm">{error}</p>}
            </div>

            <div className="p-6 border-t border-slate-800 flex gap-3 justify-end">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : modal === 'add' ? 'Add Student' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {modal === 'archive' && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <div className="text-4xl mb-3">📦</div>
              <h3 className="text-white font-semibold text-lg mb-2">Archive Student?</h3>
              <p className="text-slate-400 text-sm mb-1">
                This will mark <span className="text-white font-medium">{selectedStudent.full_name}</span> as inactive.
              </p>
              <p className="text-slate-500 text-xs">
                They will be hidden from all student lists and reports. Their data is preserved and can be restored by a superuser.
              </p>
              {error && <p className="text-rose-400 text-sm mt-3">{error}</p>}
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={saving}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Archiving...' : 'Yes, Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
