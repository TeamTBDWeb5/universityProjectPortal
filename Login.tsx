import React, { useState } from 'react';
import { BookOpen, KeyRound, Mail, Hash, User, ChevronDown } from 'lucide-react';
import { loginWithEmail, registerUser, requestPasswordReset } from '../../services/authService';

interface LoginProps {
  onLogin: (role: 'student' | 'lecturer' | 'admin') => void;
}

type AuthMode = 'login' | 'register';
type RegisterRole = 'student' | 'lecturer';

export function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [registerRole, setRegisterRole] = useState<RegisterRole>('student');
  const [loginIdType, setLoginIdType] = useState<'id' | 'email'>('email');
  const [regIdType, setRegIdType] = useState<'id' | 'email'>('id');
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isStudent = registerRole === 'student';
  const regIdLabel = isStudent ? (regIdType === 'id' ? 'Matric Number' : 'Student Email') : (regIdType === 'id' ? 'Staff ID' : 'Staff Email');
  const regIdPlaceholder = isStudent ? (regIdType === 'id' ? 'e.g. CS/2021/001' : 'student@university.edu') : (regIdType === 'id' ? 'e.g. STF-00123' : 'staff@university.edu');

  function resetFeedback() { setError(''); setMessage(''); }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    resetFeedback();
    if (loginIdType === 'id') {
      setError('ID login requires an institution-side identifier lookup. Please switch to Email for now.');
      return;
    }
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    try {
      const data = await loginWithEmail(email, password);
      const role = (data.user?.user_metadata?.role || 'student') as 'student' | 'lecturer' | 'admin';
      onLogin(role);
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in.');
    } finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    resetFeedback();
    if (!fullName || !identifier || !department || !email || !password) { setError('Complete all required fields.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    const registrationEmail = regIdType === 'email' ? identifier : email;
    if (!registrationEmail.includes('@')) { setError('Provide a valid email address.'); return; }
    setLoading(true);
    try {
      const data = await registerUser({ fullName, email: registrationEmail, password, role: registerRole, identifier, department });
      if (data.session) {
        onLogin(registerRole);
      } else {
        setMessage('Account created. Check your email to confirm the account, then sign in.');
        setMode('login');
        setEmail(registrationEmail);
        setPassword('');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to create account.');
    } finally { setLoading(false); }
  }

  async function handleForgotPassword() {
    resetFeedback();
    if (!email) { setError('Enter your email address first.'); return; }
    setLoading(true);
    try { await requestPasswordReset(email); setMessage('Password reset instructions have been sent if the account exists.'); }
    catch (err: any) { setError(err?.message || 'Unable to send reset email.'); }
    finally { setLoading(false); }
  }

  const IdentifierIcon = loginIdType === 'email' ? Mail : Hash;

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full max-w-md">
        <div className="flex flex-col items-center pt-8 pb-6 px-8 border-b border-gray-100">
          <div className="w-14 h-14 bg-[#EEEDFB] rounded-full flex items-center justify-center mb-3"><BookOpen className="w-7 h-7 text-[#312DC4]" /></div>
          <h1 className="text-xl font-semibold text-gray-800">University Project Portal</h1>
          <p className="text-gray-500 text-sm mt-1">{mode === 'login' ? 'Sign in to your account' : 'Create a new account'}</p>
        </div>
        <div className="flex border-b border-gray-200">
          <button onClick={() => { setMode('login'); resetFeedback(); }} className={`flex-1 py-3 text-sm font-medium border-b-2 ${mode === 'login' ? 'border-[#312DC4] text-[#312DC4]' : 'border-transparent text-gray-500'}`}>Sign In</button>
          <button onClick={() => { setMode('register'); resetFeedback(); }} className={`flex-1 py-3 text-sm font-medium border-b-2 ${mode === 'register' ? 'border-[#312DC4] text-[#312DC4]' : 'border-transparent text-gray-500'}`}>Register</button>
        </div>
        <div className="p-8 space-y-4">
          {error && <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
          {message && <div className="p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm">{message}</div>}
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1"><label className="text-sm font-medium text-gray-700">{loginIdType === 'id' ? 'Matric / Staff ID' : 'Email Address'}</label><div className="flex gap-2 text-xs"><button type="button" onClick={() => setLoginIdType('id')} className={`font-medium ${loginIdType === 'id' ? 'text-[#312DC4] underline' : 'text-gray-400'}`}>Use ID</button><span className="text-gray-300">|</span><button type="button" onClick={() => setLoginIdType('email')} className={`font-medium ${loginIdType === 'email' ? 'text-[#312DC4] underline' : 'text-gray-400'}`}>Use Email</button></div></div>
                <div className="relative"><IdentifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={loginIdType === 'email' ? email : identifier} onChange={e => loginIdType === 'email' ? setEmail(e.target.value) : setIdentifier(e.target.value)} type={loginIdType === 'email' ? 'email' : 'text'} className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm" placeholder={loginIdType === 'email' ? 'your@university.edu' : 'Matric No. or Staff ID'} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Password</label><div className="relative"><KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={password} onChange={e => setPassword(e.target.value)} type="password" className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm" placeholder="Enter password" /></div></div>
              <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 accent-[#312DC4]" /> Remember me</label><button type="button" onClick={handleForgotPassword} className="text-sm text-[#312DC4] hover:underline">Forgot Password?</button></div>
              <button disabled={loading} type="submit" className="w-full py-2 px-4 rounded-md text-sm font-medium text-white bg-[#312DC4] hover:bg-[#2724b0] disabled:opacity-60">{loading ? 'Signing in...' : 'Sign In'}</button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">I am registering as</label><div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><select value={registerRole} onChange={e => setRegisterRole(e.target.value as RegisterRole)} className="block w-full pl-9 pr-9 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm appearance-none"><option value="student">Student</option><option value="lecturer">Lecturer</option></select></div></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label><input value={fullName} onChange={e => setFullName(e.target.value)} type="text" className="block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm" placeholder="Enter your full name" /></div>
              <div><div className="flex items-center justify-between mb-1"><label className="text-sm font-medium text-gray-700">{regIdLabel}</label><div className="flex gap-2 text-xs"><button type="button" onClick={() => setRegIdType('id')} className={`font-medium ${regIdType === 'id' ? 'text-[#312DC4] underline' : 'text-gray-400'}`}>{isStudent ? 'Matric No.' : 'Staff ID'}</button><span className="text-gray-300">|</span><button type="button" onClick={() => setRegIdType('email')} className={`font-medium ${regIdType === 'email' ? 'text-[#312DC4] underline' : 'text-gray-400'}`}>{isStudent ? 'Student Email' : 'Staff Email'}</button></div></div><div className="relative"><Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={identifier} onChange={e => setIdentifier(e.target.value)} type="text" className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm" placeholder={regIdPlaceholder} /></div></div>
              {regIdType === 'id' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Account Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" className="block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm" placeholder="your@university.edu" /></div>}
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Department</label><div className="relative"><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><select value={department} onChange={e => setDepartment(e.target.value)} className="block w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm appearance-none"><option value="">Select department</option><option>Computer Science</option><option>Software Engineering</option><option>Information Technology</option><option>Electrical Engineering</option></select></div></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Password</label><input value={password} onChange={e => setPassword(e.target.value)} type="password" className="block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm" placeholder="Create a password" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label><input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type="password" className="block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm" placeholder="Re-enter password" /></div>
              <p className="text-xs text-gray-400">Administrator accounts are provisioned by an existing administrator for security.</p>
              <button disabled={loading} type="submit" className="w-full py-2 px-4 rounded-md text-sm font-medium text-white bg-[#312DC4] hover:bg-[#2724b0] disabled:opacity-60">{loading ? 'Creating account...' : 'Create Account'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
