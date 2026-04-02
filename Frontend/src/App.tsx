import './App.css';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
// import PersonalPage from './pages/personalPage';
import ChatPage from './pages/chatPage';
import ConversationsPage from './pages/ConversationPage';
import GroupConversationPage from './pages/GroupConversationPage';
import LoginPage from './pages/login'
import VerifyPage from './pages/verify'
import BasicInfoPage from './pages/basicInfo'
import ProfilePage from './pages/profile'
import { PretextBackdrop, type PretextBackdropVariant } from './pretext/PretextBackdrop';

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
