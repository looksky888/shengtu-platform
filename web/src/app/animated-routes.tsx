import { useEffect, useState, type ReactNode } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  motion,
  useReducedMotion,
  type Transition,
} from "motion/react";
import { LoaderCircle } from "lucide-react";

import { appRoutes } from "@/app/route-config";
import { buildLoginRedirectUrl } from "@/lib/request-unauthorized";
import {
  AUTH_SESSION_CHANGE_EVENT,
  getCachedAuthSession,
  getVerifiedAuthSession,
} from "@/lib/session";
import { ResolvedAuthSessionContext } from "@/lib/use-auth-guard";
import { canAccessPath, getDefaultRouteForSession, type StoredAuthSession } from "@/store/auth";

const routeTransition: Transition = {
  duration: 0.14,
  ease: [0.22, 1, 0.36, 1],
};

const reducedRouteTransition: Transition = {
  duration: 0.01,
};

function PermissionRoute({ requiredPath, children }: { requiredPath?: string; children: ReactNode }) {
  const location = useLocation();
  const [session, setSession] = useState<StoredAuthSession | null | undefined>(() => getCachedAuthSession());

  useEffect(() => {
    let active = true;
    const syncFromCache = () => {
      const cached = getCachedAuthSession();
      // Only promote when cache is resolved (null | session); keep waiting while undefined.
      if (cached !== undefined) {
        setSession(cached);
      }
    };
    const onSessionChange = () => {
      if (active) syncFromCache();
    };
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, onSessionChange);
    void getVerifiedAuthSession().then((verified) => {
      if (!active) return;
      setSession(verified);
    });
    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, onSessionChange);
    };
  }, []);

  if (!requiredPath) {
    return children;
  }
  // P1-15: do not render protected pages until session is resolved.
  if (session === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to={buildLoginRedirectUrl(`${location.pathname}${location.search}${location.hash}`)} replace />;
  }
  if (!canAccessPath(session, requiredPath)) {
    return <Navigate to={getDefaultRouteForSession(session)} replace />;
  }
  return (
    <ResolvedAuthSessionContext.Provider value={session}>
      {children}
    </ResolvedAuthSessionContext.Provider>
  );
}

export function AnimatedRoutes() {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      key={location.pathname}
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? reducedRouteTransition : routeTransition}
      className="min-w-0"
    >
      <Routes location={location}>
        {appRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={<PermissionRoute requiredPath={route.requiredPath}>{route.element}</PermissionRoute>}
          />
        ))}
      </Routes>
    </motion.div>
  );
}
