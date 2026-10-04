import { Navigate, useLocation } from 'react-router-dom';

// Redirects an unauthenticated user to /login while preserving the current
// path + query as ?returnTo= so the post-login destination resumes the original
// page. This is what makes invite deep-links (/join/:id?as=member) survive the
// auth round-trip: without it, ProtectedRoute's redirect to /login drops the
// destination and the user lands on / after signing in. safeReturnTo() on the
// login page validates the value is same-origin and not an auth page.
export default function UnauthenticatedRedirect() {
  const location = useLocation();
  const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
  const isAuthPage = authPaths.includes(location.pathname);
  const target = isAuthPage ? '/' : location.pathname + location.search;
  const returnTo = target === '/' ? '' : encodeURIComponent(target);
  const loginUrl = returnTo ? `/login?returnTo=${returnTo}` : '/login';
  return <Navigate to={loginUrl} replace />;
}