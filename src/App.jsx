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
import GatheringShell from '@/components/GatheringShell';
import GatheringAgent from '@/pages/GatheringAgent';
import GatheringJourney from '@/pages/GatheringJourney';
import JourneyDetail from '@/pages/JourneyDetail';
import GatheringExpenses from '@/pages/GatheringExpenses';
import GatheringMembers from '@/pages/GatheringMembers';
import GatheringSettings from '@/pages/GatheringSettings';
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
              <Route path="/join/:gatheringId" element={<JoinGathering />} />
              <Route path="/gathering/:id" element={<GatheringShell />}>
                <Route index element={<Navigate to="journey" replace />} />
                <Route path="agent" element={<GatheringAgent />} />
                <Route path="journey" element={<GatheringJourney />} />
                <Route path="journey/:itemId" element={<JourneyDetail />} />
                <Route path="expenses" element={<GatheringExpenses />} />
                <Route path="members" element={<GatheringMembers />} />
                <Route path="settings" element={<GatheringSettings />} />
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