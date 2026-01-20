import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';

export function useBlockNavigation(shouldBlock: boolean, message?: string) {
  const navigator = useContext(UNSAFE_NavigationContext).navigator;
  const isBlockingRef = useRef(false);

  useEffect(() => {
    isBlockingRef.current = shouldBlock;
  }, [shouldBlock]);

  // Block browser refresh/close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isBlockingRef.current) {
        e.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [message]);

  // Patch navigator methods to intercept navigation
  useEffect(() => {
    if (!shouldBlock || !navigator) return;

    const originalPush = navigator.push;
    const originalReplace = navigator.replace;
    const originalGo = navigator.go;

    const checkBeforeNavigate = () => {
      if (isBlockingRef.current) {
        const confirmed = window.confirm(
          message || 'You have unsaved changes. Are you sure you want to leave?',
        );
        return confirmed;
      }
      return true;
    };

    // @ts-ignore - patching navigator methods
    navigator.push = function (...args) {
      if (checkBeforeNavigate()) {
        return originalPush.apply(this, args);
      }
    };

    // @ts-ignore
    navigator.replace = function (...args) {
      if (checkBeforeNavigate()) {
        return originalReplace.apply(this, args);
      }
    };

    // @ts-ignore
    navigator.go = function (...args) {
      if (checkBeforeNavigate()) {
        return originalGo.apply(this, args);
      }
    };

    return () => {
      // Restore original methods
      // @ts-ignore
      navigator.push = originalPush;
      // @ts-ignore
      navigator.replace = originalReplace;
      // @ts-ignore
      navigator.go = originalGo;
    };
  }, [shouldBlock, message, navigator]);
}
