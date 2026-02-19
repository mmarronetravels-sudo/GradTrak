import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

function Navbar() {
  const { profile, isEvaluator, signOut } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const isAdmin = profile?.role === 'district_admin'
  const isHR = profile?.role === 'hr'
  const isEval = isEvaluator || isAdmin // Admin always has evaluator access

  // Build nav links based on role and is_evaluator flag
  const getNavLinks = () => {
    // District Admin — sees everything
    if (isAdmin) {
      return [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/staff', label: 'Staff' },
        { href: '/observations', label: 'Observations' },
        { href: '/meetings', label: 'Meetings' },
        { href: '/summatives', label: 'Summatives' },
        { href: '/goal-approvals', label: 'Goal Approvals' },
        { href: '/leave-tracker', label: 'Leave Tracker' },
        { href: '/ode-staff-position', label: 'ODE Position File' },
        { href: '/reports', label: 'Reports' },
      ]
    }

    // HR — Dashboard, Staff, Leave Tracker, ODE Position File, Reports
    if (isHR) {
      return [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/staff', label: 'Staff' },
        { href: '/leave-tracker', label: 'Leave Tracker' },
        { href: '/ode-staff-position', label: 'ODE Position File' },
        { href: '/reports', label: 'Reports' },
      ]
    }

    // Evaluator (licensed_staff or classified_staff with is_evaluator = true)
    // Gets evaluator management links + their own staff links
    if (isEval) {
      return [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/staff', label: 'Staff' },
        { href: '/observations', label: 'Observations' },
        { href: '/meetings', label: 'Meetings' },
        { href: '/summatives', label: 'Summatives' },
        { href: '/goal-approvals', label: 'Goal Approvals' },
        { href: '/reports', label: 'Reports' },
        // Divider concept — own evaluation links
        { href: '/goals', label: 'My Goals' },
        { href: '/self-reflection', label: 'Self-Reflection' },
        { href: '/my-observations', label: 'My Observations' },
        { href: '/my-meetings', label: 'My Meetings' },
        { href: '/my-summative', label: 'My Evaluation' },
      ]
    }

    // Regular staff (licensed_staff or classified_staff, not evaluator)
    return [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/goals', label: 'My Goals' },
      { href: '/self-reflection', label: 'Self-Reflection' },
      { href: '/my-observations', label: 'My Observations' },
      { href: '/my-meetings', label: 'My Meetings' },
      { href: '/my-summative', label: 'My Evaluation' },
    ]
  }

  const navLinks = getNavLinks()
  const currentPath = window.location.pathname

  return (
    <nav className="bg-[#2c3e7e] shadow">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          {/* Logo + Desktop Nav */}
          <div className="flex items-center gap-8">
            <a href="/dashboard" className="text-xl font-bold text-white">
              StaffTrak
            </a>
            {/* Desktop Navigation */}
            <div className="hidden lg:flex gap-4 flex-wrap">
              {navLinks.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`text-white hover:text-gray-200 text-sm ${
                    currentPath === link.href ? 'font-semibold' : ''
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* Right side — User name + Logout + Mobile toggle */}
          <div className="flex items-center gap-4">
            <span className="text-white text-sm hidden sm:inline">
              {profile?.full_name}
            </span>
            {isEval && !isAdmin && (
              <span className="text-xs bg-[#f3843e] text-white px-2 py-0.5 rounded hidden sm:inline">
                Evaluator
              </span>
            )}
            {isAdmin && (
              <span className="text-xs bg-[#f3843e] text-white px-2 py-0.5 rounded hidden sm:inline">
                Admin
              </span>
            )}
            {isHR && (
              <span className="text-xs bg-[#477fc1] text-white px-2 py-0.5 rounded hidden sm:inline">
                HR
              </span>
            )}
            <button
              onClick={handleLogout}
              className="bg-white text-[#2c3e7e] px-4 py-2 rounded-lg hover:bg-gray-100 text-sm"
            >
              Logout
            </button>
            {/* Mobile hamburger */}
            <button
              className="lg:hidden text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 pb-2 border-t border-white/20 pt-4">
            <div className="flex flex-col gap-2">
              <span className="text-white text-sm font-medium sm:hidden mb-2">
                {profile?.full_name}
              </span>
              {navLinks.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`text-white hover:text-gray-200 py-1 ${
                    currentPath === link.href ? 'font-semibold' : ''
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}

export default Navbar
