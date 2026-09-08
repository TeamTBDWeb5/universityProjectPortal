import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentProfile, logoutUser } from '../services/authService';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { StudentDashboard, ProjectTopicSelection, SubmissionAndFeedback, ProgressTracking, StudentMessaging } from './components/StudentScreens';
import { LecturerDashboard, ProjectTopicUpload, ViewAssignedStudents, SupervisorWorkloadTracking, LecturerMessaging } from './components/LecturerScreens';
import { AdminDashboard, TopicApproval, SupervisorAllocation, ReportGeneration } from './components/AdminScreens';

type Role = 'student' | 'lecturer' | 'admin' | null;

export default function App() {
  const [role, setRole] = useState<Role>(null);
  const [currentScreen, setCurrentScreen] = useState('dashboard');
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const profile = await getCurrentProfile();
          if (mounted) setRole((profile?.role as Role) ?? null);
        }
      } catch (error) {
        console.error('Session restore failed:', error);
      } finally {
        if (mounted) setInitializing(false);
      }
    }

    restoreSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        if (mounted) setRole(null);
        return;
      }
      try {
        const profile = await getCurrentProfile();
        if (mounted) {
          setRole((profile?.role as Role) ?? null);
          setCurrentScreen('dashboard');
        }
      } catch (error) {
        console.error('Unable to load profile:', error);
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const handleLogin = (selectedRole: 'student' | 'lecturer' | 'admin') => {
    setRole(selectedRole);
    setCurrentScreen('dashboard');
  };

  const handleLogout = async () => {
    try { await logoutUser(); } catch (error) { console.error('Logout failed:', error); }
    setRole(null);
    setCurrentScreen('dashboard');
  };

  if (initializing) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading portal...</div>;
  if (!role) return <Login onLogin={handleLogin} />;

  const renderScreen = () => {
    if (role === 'student') switch (currentScreen) {
      case 'topic-selection': return <ProjectTopicSelection onNavigate={setCurrentScreen} />;
      case 'submission': return <SubmissionAndFeedback onNavigate={setCurrentScreen} />;
      case 'progress': return <ProgressTracking onNavigate={setCurrentScreen} />;
      case 'messages': return <StudentMessaging onNavigate={setCurrentScreen} />;
      default: return <StudentDashboard onNavigate={setCurrentScreen} />;
    }
    if (role === 'lecturer') switch (currentScreen) {
      case 'topic-upload': return <ProjectTopicUpload onNavigate={setCurrentScreen} />;
      case 'view-students': return <ViewAssignedStudents onNavigate={setCurrentScreen} />;
      case 'workload': return <SupervisorWorkloadTracking onNavigate={setCurrentScreen} />;
      case 'messages': return <LecturerMessaging onNavigate={setCurrentScreen} />;
      default: return <LecturerDashboard onNavigate={setCurrentScreen} />;
    }
    switch (currentScreen) {
      case 'topic-approval': return <TopicApproval onNavigate={setCurrentScreen} />;
      case 'supervisor-allocation': return <SupervisorAllocation onNavigate={setCurrentScreen} />;
      case 'report-generation': return <ReportGeneration onNavigate={setCurrentScreen} />;
      default: return <AdminDashboard onNavigate={setCurrentScreen} />;
    }
  };

  return <Layout role={role} currentScreen={currentScreen} onNavigate={setCurrentScreen} onLogout={handleLogout}>{renderScreen()}</Layout>;
}
