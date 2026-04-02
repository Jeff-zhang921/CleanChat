import './App.css';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { CSSProperties } from 'react';
// import PersonalPage from './pages/personalPage';
import ChatPage from './pages/chatPage';
import ConversationsPage from './pages/ConversationPage';
import GroupConversationPage from './pages/GroupConversationPage';
import LoginPage from './pages/login'
import VerifyPage from './pages/verify'
import BasicInfoPage from './pages/basicInfo'
import ProfilePage from './pages/profile'

type PretextBackdropVariant = 'auth' | 'app';

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
      'radial-gradient(90rem 52rem at 0% -8%, rgba(61, 132, 102, 0.13), rgba(61, 132, 102, 0)), radial-gradient(66rem 44rem at 100% 100%, rgba(217, 142, 96, 0.14), rgba(217, 142, 96, 0)), radial-gradient(50rem 36rem at 55% 10%, rgba(255, 249, 240, 0.65), rgba(255, 249, 240, 0)), linear-gradient(145deg, #f8f2e7 0%, #f3ebdc 48%, #f7f2e9 100%)',
    line: 'rgba(59, 72, 59, 0.08)',
    glow: 'rgba(255, 252, 245, 0.8)',
    orbitA: 'rgba(34, 124, 90, 0.16)',
    orbitB: 'rgba(216, 134, 88, 0.14)',
    orbitC: 'rgba(117, 101, 83, 0.12)',
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
          opacity: 0.75,
          backgroundImage: `
            linear-gradient(${palette.line} 1px, transparent 1px),
            linear-gradient(90deg, ${palette.line} 1px, transparent 1px)
          `,
          backgroundSize: 'min(7vw, 84px) min(7vw, 84px)',
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
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage/>} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/basic-info" element={<BasicInfoPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/conversations" element={<ConversationsPage />} />
          <Route path="/groups" element={<GroupConversationPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
          {/* <Route path="/personal" element={<PersonalPage />} /> */}
        </Routes>
      </div>
    </div>
  );
};

function App(){
    return <RoutedApp />;
}
export default App;
