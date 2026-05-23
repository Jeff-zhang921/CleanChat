import './App.css';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
// import PersonalPage from './pages/personalPage';
import { getAuthToken } from './utils/auth';

const ChatPage = lazy(() => import('./pages/chatPage'));
const ChatSettingsPage = lazy(() => import('./pages/chatSettings'));
const GroupSettingsPage = lazy(() => import('./pages/groupSettings'));
const ConversationsPage = lazy(() => import('./pages/ConversationPage'));
const GroupConversationPage = lazy(() => import('./pages/GroupConversationPage'));
const LoginPage = lazy(() => import('./pages/login'));
const VerifyPage = lazy(() => import('./pages/verify'));
const BasicInfoPage = lazy(() => import('./pages/basicInfo'));
const ProfilePage = lazy(() => import('./pages/profile'));
const UserProfilePage = lazy(() => import('./pages/userProfile'));
const ProfileEditPage = lazy(() => import('./pages/profileEdit'));
const SendChatRequestPage = lazy(() => import('./pages/sendChatRequest'));
const UserRequestPage = lazy(() => import('./pages/userRequestPage'));
const GroupRequestPage = lazy(() => import('./pages/groupRequestPage'));
const ProfileSettingsPage = lazy(() => import('./pages/profileSettings'));
const FeedbackPage = lazy(() => import('./pages/feedback'));
const DiscoverPage = lazy(() => import('./pages/discover'));
const ProfileAvatarPage = lazy(() => import('./pages/profileAvatar'));
const NotificationBadgeProvider = lazy(() =>
  import('./state/notificationBadgeContext').then(({ NotificationBadgeProvider }) => ({
    default: NotificationBadgeProvider,
  })),
);

type PretextBackdropVariant = 'auth' | 'app';
type RootViewKey = 'conversations' | 'groups' | 'discover' | 'profile' | 'settings';
type DetailViewKey =
  | 'chat'
  | 'chat-settings'
  | 'group-settings'
  | 'feedback'
  | 'profile-edit'
  | 'profile-avatar'
  | 'profile-user'
  | 'send-chat-request'
  | 'user-requests'
  | 'group-requests'
  | null;
type ChatRouteState = {
  fromPath?: '/conversations' | '/groups';
};

type DetailRouteState = {
  fromPath?: '/conversations' | '/groups' | '/profile';
};

const backdropPalettes = {
  auth: {
    base:
      'radial-gradient(82rem 48rem at 12% 0%, rgba(49, 133, 96, 0.16), rgba(49, 133, 96, 0)), radial-gradient(68rem 40rem at 100% 12%, rgba(211, 122, 84, 0.16), rgba(211, 122, 84, 0)), radial-gradient(52rem 40rem at 45% 100%, rgba(132, 98, 70, 0.12), rgba(132, 98, 70, 0)), linear-gradient(135deg, #f7f0e2 0%, #efe5d1 52%, #f6efe3 100%)',
    line: 'rgba(43, 58, 43, 0.09)',
    glow: 'rgba(255, 251, 243, 0.72)',
    orbitA: 'rgba(34, 112, 82, 0.22)',
    orbitB: 'rgba(206, 118, 82, 0.18)',
    orbitC: 'rgba(132, 102, 74, 0.16)',
  },
  app: {
    base:
      'radial-gradient(88rem 48rem at 12% -12%, rgba(61, 132, 102, 0.08), rgba(61, 132, 102, 0)), radial-gradient(54rem 34rem at 100% 100%, rgba(217, 142, 96, 0.09), rgba(217, 142, 96, 0)), linear-gradient(145deg, #f8f2e7 0%, #f3ebdc 52%, #f7f2e9 100%)',
    line: 'rgba(59, 72, 59, 0.03)',
    glow: 'rgba(255, 252, 245, 0.8)',
    orbitA: 'rgba(34, 124, 90, 0.11)',
    orbitB: 'rgba(216, 134, 88, 0.09)',
    orbitC: 'rgba(117, 101, 83, 0.08)',
  },
} as const;

const layerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
};

const PretextBackdrop = ({ variant }: { variant: PretextBackdropVariant }) => {
  const palette = backdropPalettes[variant];
  const isAppVariant = variant === 'app';

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
        background: palette.base,
      }}
    >
      <div
        style={{
          ...layerStyle,
          opacity: isAppVariant ? 0.22 : 0.75,
          backgroundImage: `
            linear-gradient(${palette.line} 1px, transparent 1px),
            linear-gradient(90deg, ${palette.line} 1px, transparent 1px)
          `,
          backgroundSize: isAppVariant ? 'min(10vw, 124px) min(10vw, 124px)' : 'min(7vw, 84px) min(7vw, 84px)',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0.18))',
          WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0.18))',
        }}
      />

      <div
        style={{
          ...layerStyle,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.08) 42%, rgba(255,255,255,0.24) 100%)',
        }}
      />

      <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" style={layerStyle}>
        <defs>
          <filter id="pretext-blur-a" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="48" />
          </filter>
          <filter id="pretext-blur-b" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="74" />
          </filter>
          <radialGradient id="pretext-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={palette.glow} />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {isAppVariant ? (
          <g opacity="0.62">
            <circle cx="260" cy="160" r="180" fill={palette.orbitA} filter="url(#pretext-blur-b)" />
            <circle cx="1300" cy="260" r="210" fill={palette.orbitB} filter="url(#pretext-blur-b)" />
            <circle cx="850" cy="840" r="220" fill={palette.orbitC} filter="url(#pretext-blur-b)" />
          </g>
        ) : (
          <>
            <g opacity="0.92">
              <circle cx="260" cy="160" r="180" fill={palette.orbitA} filter="url(#pretext-blur-b)">
                <animate attributeName="cx" values="240;320;240" dur="22s" repeatCount="indefinite" />
                <animate attributeName="cy" values="170;130;170" dur="26s" repeatCount="indefinite" />
              </circle>
              <circle cx="1300" cy="260" r="210" fill={palette.orbitB} filter="url(#pretext-blur-b)">
                <animate attributeName="cx" values="1280;1360;1280" dur="28s" repeatCount="indefinite" />
                <animate attributeName="cy" values="240;300;240" dur="32s" repeatCount="indefinite" />
              </circle>
              <circle cx="850" cy="840" r="220" fill={palette.orbitC} filter="url(#pretext-blur-b)">
                <animate attributeName="cx" values="840;760;840" dur="24s" repeatCount="indefinite" />
                <animate attributeName="cy" values="840;780;840" dur="30s" repeatCount="indefinite" />
              </circle>
            </g>

            <g opacity="0.5">
              <path
                d="M96 790c168-156 364-242 590-258 238-18 454 38 818 182"
                fill="none"
                stroke={palette.orbitA}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="12 18"
              >
                <animate attributeName="stroke-dashoffset" values="0;-180" dur="18s" repeatCount="indefinite" />
              </path>
              <path
                d="M70 278c170 72 348 102 540 86 210-18 430-92 720-248"
                fill="none"
                stroke={palette.orbitB}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeDasharray="8 24"
              >
                <animate attributeName="stroke-dashoffset" values="0;240" dur="24s" repeatCount="indefinite" />
              </path>
              <path
                d="M364 84c56 138 186 252 354 312 132 48 320 54 544 16"
                fill="none"
                stroke={palette.orbitC}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeDasharray="4 16"
              >
                <animate attributeName="stroke-dashoffset" values="0;-120" dur="20s" repeatCount="indefinite" />
              </path>
            </g>

            <g opacity="0.85">
              <circle cx="330" cy="250" r="3.5" fill="#245f45">
                <animateMotion dur="19s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#pretext-path-a" />
                </animateMotion>
              </circle>
              <circle cx="1170" cy="208" r="4" fill="#c96f4a">
                <animateMotion dur="24s" repeatCount="indefinite" rotate="auto-reverse">
                  <mpath href="#pretext-path-b" />
                </animateMotion>
              </circle>
            </g>
          </>
        )}

        <path
          id="pretext-path-a"
          d="M120 700c220-160 470-230 760-212 198 12 382 64 564 142"
          fill="none"
          stroke="transparent"
        />
        <path
          id="pretext-path-b"
          d="M180 240c200 86 412 112 648 84 182-22 352-80 536-192"
          fill="none"
          stroke="transparent"
        />

        <ellipse
          cx="520"
          cy="420"
          rx="420"
          ry="180"
          fill="url(#pretext-glow)"
          filter="url(#pretext-blur-a)"
          opacity="0.38"
        />
      </svg>
    </div>
  );
};

const HomeRedirect = () => {
  const hasToken = getAuthToken().length > 0;
  return <Navigate to={hasToken ? '/conversations' : '/login'} replace />;
};

const AppRouteFallback = () => (
  <div className="app-route-fallback" role="status" aria-live="polite">
    <span />
  </div>
);

const normalizePathname = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

const resolveRootViewFromPath = (
  pathname: string,
  fallback: RootViewKey = 'conversations'
): RootViewKey => {
  if (pathname === '/groups' || pathname.startsWith('/groups/')) return 'groups';
  if (pathname === '/discover') return 'discover';
  if (pathname === '/profile/settings') return 'settings';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname === '/conversations') return 'conversations';
  return fallback;
};

const resolveDetailViewFromPath = (pathname: string): DetailViewKey => {
  if (pathname === '/chat/settings') return 'chat-settings';
  if (pathname === '/chat/group/settings') return 'group-settings';
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return 'chat';
  if (pathname === '/profile/feedback') return 'feedback';
  if (pathname === '/profile/avatar') return 'profile-avatar';
  if (/^\/profile\/user\/\d+$/.test(pathname)) return 'profile-user';
  if (pathname === '/profile/request-chat') return 'send-chat-request';
  if (pathname === '/profile/requests/users') return 'user-requests';
  if (pathname === '/profile/requests/groups') return 'group-requests';
  if (pathname === '/profile/edit') return 'profile-edit';
  return null;
};

const isKnownHybridPath = (pathname: string) => {
  if (pathname === '/conversations') return true;
  if (pathname === '/groups' || pathname.startsWith('/groups/')) return true;
  if (pathname === '/discover') return true;
  if (pathname === '/profile') return true;
  if (pathname === '/profile/settings') return true;
  if (pathname === '/profile/feedback') return true;
  if (pathname === '/profile/avatar') return true;
  if (pathname === '/profile/edit') return true;
  if (/^\/profile\/user\/\d+$/.test(pathname)) return true;
  if (pathname === '/profile/request-chat') return true;
  if (pathname === '/profile/requests/users') return true;
  if (pathname === '/profile/requests/groups') return true;
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return true;
  return false;
};

const resolveChatBaseView = (
  pathname: string,
  locationState: unknown,
  fallback: RootViewKey
): RootViewKey => {
  const state = (locationState as ChatRouteState | null) ?? null;
  if (state?.fromPath === '/groups') {
    return 'groups';
  }
  if (state?.fromPath === '/conversations') {
    return 'conversations';
  }
  if (pathname.startsWith('/chat/group/')) {
    return 'groups';
  }
  if (pathname.startsWith('/groups')) {
    return 'groups';
  }
  if (fallback === 'groups') {
    return 'groups';
  }
  return 'conversations';
};

const HybridAppShell = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = normalizePathname(location.pathname);
  const hasToken = getAuthToken().length > 0;

  const initialRoot = resolveRootViewFromPath(pathname, 'conversations');
  const [activeRootView, setActiveRootView] = useState<RootViewKey>(initialRoot);
  const [mountedRootViews, setMountedRootViews] = useState<Record<RootViewKey, boolean>>(() => ({
    conversations: true,
    groups: initialRoot === 'groups',
    discover: initialRoot === 'discover',
    profile: initialRoot === 'profile' || initialRoot === 'settings',
    settings: initialRoot === 'settings',
  }));
  const lastRootViewRef = useRef<RootViewKey>(initialRoot);
  const detailView = resolveDetailViewFromPath(pathname);
  const hasDetailOverlay = detailView !== null;

  useEffect(() => {
    if (!hasToken) {
      return;
    }

    if (detailView === 'chat' || detailView === 'chat-settings' || detailView === 'group-settings') {
      const baseView = resolveChatBaseView(pathname, location.state, lastRootViewRef.current);
      lastRootViewRef.current = baseView;
      setActiveRootView((current) => (current === baseView ? current : baseView));
      setMountedRootViews((current) =>
        current[baseView] ? current : { ...current, [baseView]: true }
      );
      return;
    }

    if (detailView === 'profile-user' || detailView === 'send-chat-request') {
      const detailState = (location.state as DetailRouteState | null) ?? null;
      const baseView: RootViewKey =
        detailState?.fromPath === '/groups'
          ? 'groups'
          : detailState?.fromPath === '/conversations'
            ? 'conversations'
            : 'profile';

      lastRootViewRef.current = baseView;
      setActiveRootView((current) => (current === baseView ? current : baseView));
      setMountedRootViews((current) =>
        current[baseView] ? current : { ...current, [baseView]: true }
      );
      return;
    }

    if (
      detailView === 'feedback' ||
      detailView === 'profile-edit' ||
      detailView === 'profile-avatar' ||
      detailView === 'user-requests' ||
      detailView === 'group-requests'
    ) {
      lastRootViewRef.current = 'profile';
      setActiveRootView((current) => (current === 'profile' ? current : 'profile'));
      setMountedRootViews((current) =>
        current.profile ? current : { ...current, profile: true }
      );
      return;
    }

    const nextRoot = resolveRootViewFromPath(pathname, lastRootViewRef.current);
    lastRootViewRef.current = nextRoot;
    setActiveRootView((current) => (current === nextRoot ? current : nextRoot));
    setMountedRootViews((current) =>
      current[nextRoot] ? current : { ...current, [nextRoot]: true }
    );
  }, [detailView, hasToken, location.state, pathname]);

  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }

  if (!isKnownHybridPath(pathname)) {
    return <Navigate to="/conversations" replace />;
  }

  const renderDetailOverlay = () => {
    if (detailView === 'chat') {
      return (
        <div className="hybrid-detail-surface hybrid-chat-overlay" role="presentation">
          <ChatPage
            onRequestClose={(fromPath) => {
              navigate(fromPath === '/groups' ? '/groups' : '/conversations', { replace: true });
            }}
          />
        </div>
      );
    }

    if (detailView === 'chat-settings') {
      return (
        <div className="hybrid-detail-surface" role="presentation">
          <ChatSettingsPage />
        </div>
      );
    }

    if (detailView === 'group-settings') {
      return (
        <div className="hybrid-detail-surface" role="presentation">
          <GroupSettingsPage />
        </div>
      );
    }

    if (detailView === 'feedback') {
      return (
        <div className="hybrid-detail-surface" role="presentation">
          <FeedbackPage />
        </div>
      );
    }

    if (detailView === 'profile-user') {
      return (
        <div className="hybrid-detail-surface" role="presentation">
          <UserProfilePage />
        </div>
      );
    }

    if (detailView === 'send-chat-request') {
      return (
        <div className="hybrid-detail-surface" role="presentation">
          <SendChatRequestPage />
        </div>
      );
    }

    if (detailView === 'user-requests') {
      return (
        <div className="hybrid-detail-surface" role="presentation">
          <UserRequestPage />
        </div>
      );
    }

    if (detailView === 'group-requests') {
      return (
        <div className="hybrid-detail-surface" role="presentation">
          <GroupRequestPage />
        </div>
      );
    }

    if (detailView === 'profile-edit') {
      return (
        <div className="hybrid-detail-surface" role="presentation">
          <ProfileEditPage />
        </div>
      );
    }

    if (detailView === 'profile-avatar') {
      return (
        <div className="hybrid-detail-surface" role="presentation">
          <ProfileAvatarPage />
        </div>
      );
    }

    return null;
  };

  const isConversationInteractive = !hasDetailOverlay && activeRootView === 'conversations';

  return (
    <div className="hybrid-app-shell">
      <div className="hybrid-root-stack">
        {mountedRootViews.conversations && (
          <section
            className={`hybrid-root-view ${activeRootView === 'conversations' ? 'is-active' : ''} ${hasDetailOverlay && activeRootView === 'conversations' ? 'is-sleeping' : ''}`}
            aria-hidden={!isConversationInteractive}
          >
            <ConversationsPage isDormant={!isConversationInteractive} />
          </section>
        )}

        {mountedRootViews.groups && (
          <section
            className={`hybrid-root-view ${activeRootView === 'groups' ? 'is-active' : ''} ${hasDetailOverlay && activeRootView === 'groups' ? 'is-sleeping' : ''}`}
            aria-hidden={hasDetailOverlay || activeRootView !== 'groups'}
          >
            <GroupConversationPage />
          </section>
        )}

        {mountedRootViews.discover && (
          <section
            className={`hybrid-root-view ${activeRootView === 'discover' ? 'is-active' : ''} ${hasDetailOverlay && activeRootView === 'discover' ? 'is-sleeping' : ''}`}
            aria-hidden={hasDetailOverlay || activeRootView !== 'discover'}
          >
            <DiscoverPage />
          </section>
        )}

        {mountedRootViews.profile && (
          <section
            className={`hybrid-root-view ${activeRootView === 'profile' ? 'is-active' : ''} ${hasDetailOverlay && activeRootView === 'profile' ? 'is-sleeping' : ''}`}
            aria-hidden={hasDetailOverlay || activeRootView !== 'profile'}
          >
            <ProfilePage />
          </section>
        )}

        {mountedRootViews.settings && (
          <section
            className={`hybrid-root-view ${activeRootView === 'settings' ? 'is-active' : ''} ${hasDetailOverlay && activeRootView === 'settings' ? 'is-sleeping' : ''}`}
            aria-hidden={hasDetailOverlay || activeRootView !== 'settings'}
          >
            <ProfileSettingsPage />
          </section>
        )}
      </div>

      {hasDetailOverlay && (
        <div className="hybrid-detail-layer" role="presentation" aria-hidden="false">
          {renderDetailOverlay()}
        </div>
      )}
    </div>
  );
};

const ProtectedHybridRoute = () => {
  const hasToken = getAuthToken().length > 0;

  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <NotificationBadgeProvider>
      <HybridAppShell />
    </NotificationBadgeProvider>
  );
};

const RoutedApp = () => {
  const location = useLocation();
  const authRoutes = ['/login', '/verify', '/basic-info'];
  const variant: PretextBackdropVariant = authRoutes.some((route) => location.pathname.startsWith(route))
    ? 'auth'
    : 'app';

  return (
    <div style={{ position: 'relative', minHeight: '100svh' }}>
      <PretextBackdrop variant={variant} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="app-route-stage">
          <Suspense fallback={<AppRouteFallback />}>
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/login" element={<LoginPage/>} />
              <Route path="/verify" element={<VerifyPage />} />
              <Route path="/basic-info" element={<BasicInfoPage />} />
              <Route path="/profile/vault" element={<Navigate to="/profile/edit" replace />} />
              <Route path="*" element={<ProtectedHybridRoute />} />
              {/* <Route path="/personal" element={<PersonalPage />} /> */}
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
};

function App(){
    return <RoutedApp />;
}
export default App;
