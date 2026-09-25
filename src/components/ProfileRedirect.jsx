import { useParams, Navigate } from 'react-router-dom';

// Redirects the legacy gathering-scoped profile route to the canonical
// universal profile route, preserving the gathering as context (?g=).
export default function ProfileRedirect() {
  const { id, userId } = useParams();
  return <Navigate to={`/profile/${userId}?g=${id || ''}`} replace />;
}