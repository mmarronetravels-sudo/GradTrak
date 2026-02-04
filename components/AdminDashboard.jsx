import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { 
  Users, 
  GraduationCap, 
  AlertTriangle, 
  RefreshCw, 
  ChevronDown,
  Building2,
  Calendar,
  UserCheck,
  UserX,
  ArrowRight,
  LogOut
} from 'lucide-react';

export default function AdminDashboard({ user, profile, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [counselors, setCounselors] = useState([]);
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedCounselor, setSelectedCounselor] = useState('');
  const [showLinkParentModal, setShowLinkParentModal] = useState(false);  
  const [reassigning, setReassigning] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (profile?.school_id) {
      fetchDashboardData();
    }
  }, [profile]);

  async function fetchDashboardData() {
    setLoading(true);
    setError(null);
    
    try {
      const schoolId = profile.school_id;

      // Fetch subscription status
      const { data: schoolData, error: schoolError } = await supabase
        .from('schools')
        .select('*')
        .eq('id', schoolId)
        .single();

      if (schoolError) throw schoolError;

      // Get student count
      const { count: studentCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('role', 'student');

      setSubscription({
        ...schoolData,
        current_students: studentCount || 0,
        usage_percentage: schoolData.max_students 
          ? Math.round((studentCount / schoolData.max_students) * 100)
          : 0
      });

      // Fetch counselors with their caseloads
      const { data: counselorData, error: counselorError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('school_id', schoolId)
        .eq('role', 'counselor');

      if (counselorError) throw counselorError;

      // For each counselor, get their student counts by grade
      const counselorsWithCounts = await Promise.all(
        counselorData.map(async (counselor) => {
          const { data: assignments } = await supabase
            .from('counselor_assignments')
            .select(`
              student_id,
              profiles!counselor_assignments_student_id_fkey (grade)
            `)
            .eq('counselor_id', counselor.id);

          const gradeCounts = { 9: 0, 10: 0, 11: 0, 12: 0 };
          let total = 0;

          if (assignments) {
            assignments.forEach(a => {
              if (a.profiles?.grade) {
                gradeCounts[a.profiles.grade] = (gradeCounts[a.profiles.grade] || 0) + 1;
                total++;
              }
            });
          }

          return {
            ...counselor,
            total_students: total,
            grade_counts: gradeCounts
          };
        })
      );

      setCounselors(counselorsWithCounts);

      // Fetch unassigned students
      const { data: allStudentData } = await supabase
        .from('profiles')
        .select('id, full_name, email, grade, graduation_year')
        .eq('school_id', schoolId)
        .eq('role', 'student')
        .order('grade')
        .order('full_name');

      const { data: assignmentData } = await supabase
        .from('counselor_assignments')
        .select('student_id')
        .eq('school_id', schoolId);

      const assignedIds = new Set(assignmentData?.map(a => a.student_id) || []);
      
      const unassigned = allStudentData?.filter(s => !assignedIds.has(s.id)) || [];
      setUnassignedStudents(unassigned);
      setAllStudents(allStudentData || []);

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function reassignStudent() {
    if (!selectedStudent || !selectedCounselor) return;
    
    setReassigning(true);
    setError(null);
    setSuccessMessage('');

    try {
      // Upsert the assignment
      const { error } = await supabase
        .from('counselor_assignments')
        .upsert({
          student_id: selectedStudent.id,
          counselor_id: selectedCounselor,
          school_id: profile.school_id,
          assigned_by: user.id,
          notes: 'Reassigned via Admin Dashboard'
        }, {
          onConflict: 'student_id,school_id'
        });

      if (error) throw error;

      setSuccessMessage(`${selectedStudent.full_name} has been assigned successfully!`);
      setSelectedStudent(null);
      setSelectedCounselor('');
      
      // Refresh data
      await fetchDashboardData();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);

    } catch (err) {
      console.error('Error reassigning student:', err);
      setError(err.message);
    } finally {
      setReassigning(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const planColors = {
    pilot: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    standard: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    enterprise: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
            <p className="text-slate-400">Welcome, {profile?.full_name}</p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400">{successMessage}</p>
          </div>
        )}

        {/* Subscription Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Plan Card */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <Building2 className="w-5 h-5 text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Subscription Plan</h2>
            </div>
            <div className="space-y-4">
              <div>
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${planColors[subscription?.plan_type] || planColors.pilot}`}>
                  {subscription?.plan_type?.charAt(0).toUpperCase() + subscription?.plan_type?.slice(1)} Plan
                </span>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-1">School</p>
                <p className="text-white font-medium">{subscription?.name}</p>
              </div>
            </div>
          </div>

          {/* Student Count Card */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Student Capacity</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold text-white">{subscription?.current_students}</span>
                <span className="text-slate-400 text-lg mb-1">
                  / {subscription?.max_students || '∞'}
                </span>
              </div>
              {subscription?.max_students && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Usage</span>
                    <span className={subscription?.usage_percentage >= 80 ? 'text-amber-400' : 'text-slate-400'}>
                      {subscription?.usage_percentage}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        subscription?.usage_percentage >= 90 ? 'bg-red-500' :
                        subscription?.usage_percentage >= 80 ? 'bg-amber-500' :
                        'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(subscription?.usage_percentage, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subscription Status Card */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-violet-500/20 rounded-lg">
                <Calendar className="w-5 h-5 text-violet-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Status</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-medium">Active</span>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-1">Started</p>
                <p className="text-white font-medium">
                  {subscription?.subscription_starts_at 
                    ? new Date(subscription.subscription_starts_at).toLocaleDateString()
                    : 'N/A'}
                </p>
              </div>
              {subscription?.subscription_ends_at && (
                <div>
                  <p className="text-slate-400 text-sm mb-1">Expires</p>
                  <p className="text-white font-medium">
                    {new Date(subscription.subscription_ends_at).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Counselor Caseloads */}
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <GraduationCap className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Counselor Caseloads</h2>
            </div>
            <span className="text-slate-400 text-sm">{counselors.length} counselors</span>
          </div>

          {counselors.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No counselors found</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {counselors.map((counselor) => (
                <div 
                  key={counselor.id}
                  className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30 hover:border-slate-500/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                      {counselor.full_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate">{counselor.full_name}</h3>
                      <p className="text-slate-400 text-sm truncate">{counselor.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 text-sm">Total Students</span>
                    <span className="text-white font-semibold text-lg">{counselor.total_students}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[9, 10, 11, 12].map((grade) => (
                      <div key={grade} className="text-center">
                        <div className="text-xs text-slate-500 mb-1">Gr {grade}</div>
                        <div className={`text-sm font-medium ${counselor.grade_counts[grade] > 0 ? 'text-white' : 'text-slate-600'}`}>
                          {counselor.grade_counts[grade] || 0}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unassigned Students & Reassignment Tool */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Unassigned Students */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`p-2 rounded-lg ${unassignedStudents.length > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}>
                {unassignedStudents.length > 0 
                  ? <UserX className="w-5 h-5 text-amber-400" />
                  : <UserCheck className="w-5 h-5 text-emerald-400" />
                }
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Unassigned Students</h2>
                <p className="text-slate-400 text-sm">
                  {unassignedStudents.length > 0 
                    ? `${unassignedStudents.length} students need assignment`
                    : 'All students assigned!'
                  }
                </p>
              </div>
            </div>

            {unassignedStudents.length === 0 ? (
              <div className="text-center py-8">
                <UserCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-50" />
                <p className="text-slate-400">All students have been assigned to counselors</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {unassignedStudents.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudent(student)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedStudent?.id === student.id
                        ? 'bg-indigo-500/20 border-indigo-500/50'
                        : 'bg-slate-700/30 border-slate-600/30 hover:border-slate-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{student.full_name}</p>
                        <p className="text-slate-400 text-sm">{student.email}</p>
                      </div>
                      <span className="text-slate-500 text-sm">Grade {student.grade}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reassignment Tool */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <RefreshCw className="w-5 h-5 text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Assign Student</h2>
            </div>

            <div className="space-y-4">
              {/* Selected Student */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">Selected Student</label>
                <div className="relative">
                  <select
                    value={selectedStudent?.id || ''}
                    onChange={(e) => {
                      const student = allStudents.find(s => s.id === e.target.value);
                      setSelectedStudent(student || null);
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white appearance-none focus:outline-none focus:border-indigo-500/50"
                  >
                    <option value="">Select a student...</option>
                    {allStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.full_name} (Grade {student.grade})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <ArrowRight className="w-5 h-5 text-slate-500" />
              </div>

              {/* Select Counselor */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">Assign to Counselor</label>
                <div className="relative">
                  <select
                    value={selectedCounselor}
                    onChange={(e) => setSelectedCounselor(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white appearance-none focus:outline-none focus:border-indigo-500/50"
                  >
                    <option value="">Select a counselor...</option>
                    {counselors.map((counselor) => (
                      <option key={counselor.id} value={counselor.id}>
                        {counselor.full_name} ({counselor.total_students} students)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Assign Button */}
              <button
                onClick={reassignStudent}
                disabled={!selectedStudent || !selectedCounselor || reassigning}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {reassigning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    Assign Student
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="mt-8 text-center">
          <button
            onClick={fetchDashboardData}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Data
          </button>
        </div>

      </div>
    </div>
  );
}
