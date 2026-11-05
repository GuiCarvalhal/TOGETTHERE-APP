import { useEffect, useState } from 'react';
import { resolveLayout } from '@/lib/deviceLayout';

// Live device-experience class ('phone' | 'desktop') driven by the real
// viewport, so rotating a tablet flips the experience (portrait -> phone,
// landscape -> desktop) without a reload. See resolveLayout for the rule.
export function useDeviceLayout() {
  const [layout, setLayout] = useState(() => (
    typeof window === 'undefined' ? 'desktop' : resolveLayout(window.innerWidth, window.innerHeight)
  ));

  useEffect(() => {
    const update = () => setLayout(resolveLayout(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return layout;
}

export default useDeviceLayout;