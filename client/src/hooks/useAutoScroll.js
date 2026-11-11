import { useEffect, useRef } from 'react';

export default function useAutoScroll(dependency) {
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [dependency]);

  return endRef;
}
