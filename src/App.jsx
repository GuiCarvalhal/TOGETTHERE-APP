import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import UnauthenticatedRedirect from '@/components/UnauthenticatedRedirect';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Home from '@/pages/Home';
import HowItWorks from '@/pages/HowItWorks';
import NewGathering from '@/pages/NewGathering';
import GatheringShell from '@/components/GatheringShell';
import GatheringAgent from '@/pages/GatheringAgent';
import AgentPlaceDetail from '@/pages/AgentPlaceDetail';
import GatheringJourney from '@/pages/GatheringJourney';
import AddSegmentPage from '@/pages/AddSegmentPage';
import FlightPage from '@/pages/FlightPage';
import JourneyDetail from '@/pages/JourneyDetail';
import GatheringExpenses from '@/pages/GatheringExpenses';
import ExpenseRunningBalance from '@/pages/ExpenseRunningBalance';
import ExpenseStatement from '@/pages/ExpenseStatement';
import GatheringMembers from '@/pages/GatheringMembers';
import GatheringSettings from '@/pages/GatheringSettings';
import Profile from '@/pages/Profile';
import ProfileRedirect from '@/components/ProfileRedirect';
import JoinGathering from '@/pages/JoinGathering';
import { useOfflinePruneOnMount } from '@/lib/useOfflineSync';
import { LocaleProvider } from '@/lib/i18n';
import { registerOfflineSW } from '@/lib/registerSW';
import { useAuth } from '@/lib/AuthContext';
import { useEffect } from 'react';

function SWRegistrar() {
  const { user } = useAuth();
  useEffect(() => { if (user) registerOfflineSW(); }, [user]);
  return null;
}

function App() {
  useOfflinePruneOnMount();
  return (
    <AuthProvider>
      <LocaleProvider>
      <SWRegistrar />
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedRoute unauthenticatedElement={<UnauthenticatedRedirect />} />}>
              <Route path="/" element={<Home />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/gathering/new" element={<NewGathering />} />
              <Route path="/join/:gatheringId" element={<JoinGathering />} />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/gathering/:id" element={<GatheringShell />}>
                <Route index element={<Navigate to="journey" replace />} />
                <Route path="agent" element={<GatheringAgent />} />
                <Route path="agent/place" element={<AgentPlaceDetail />} />
                <Route path="journey" element={<GatheringJourney />} />
                <Route path="journey/new" element={<AddSegmentPage />} />
                <Route path="journey/new/flight" element={<FlightPage />} />
                <Route path="journey/:itemId/edit" element={<FlightPage />} />
                <Route path="journey/:itemId" element={<JourneyDetail />} />
                <Route path="expenses" element={<GatheringExpenses />} />
                <Route path="expenses/balance" element={<ExpenseRunningBalance />} />
                <Route path="expenses/statement/:memberId" element={<ExpenseStatement />} />
                <Route path="members" element={<GatheringMembers />} />
                <Route path="settings" element={<GatheringSettings />} />
                <Route path="profile/:userId" element={<ProfileRedirect />} />
              </Route>
            </Route>
            <Route path="*" element={<PageNotFound />} />
          </Routes>
          <Toaster />
        </Router>
      </QueryClientProvider>
      </LocaleProvider>
    </AuthProvider>
  )
}

export default App