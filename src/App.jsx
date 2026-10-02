import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Home from '@/pages/Home';
import HowItWorks from '@/pages/HowItWorks';
import GatheringShell from '@/components/GatheringShell';
import GatheringAgent from '@/pages/GatheringAgent';
import AgentPlaceDetail from '@/pages/AgentPlaceDetail';
import GatheringJourney from '@/pages/GatheringJourney';
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

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
              <Route path="/" element={<Home />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/join/:gatheringId" element={<JoinGathering />} />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/gathering/:id" element={<GatheringShell />}>
                <Route index element={<Navigate to="journey" replace />} />
                <Route path="agent" element={<GatheringAgent />} />
                <Route path="agent/place" element={<AgentPlaceDetail />} />
                <Route path="journey" element={<GatheringJourney />} />
                <Route path="journey/new" element={<FlightPage />} />
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
    </AuthProvider>
  )
}

export default App