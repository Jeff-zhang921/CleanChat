import './App.css';
import { Navigate, Route, Routes } from 'react-router-dom';
// import PersonalPage from './pages/personalPage';
import ChatPage from './pages/chatPage';
import ConversationsPage from './pages/ConversationPage';
import LoginPage from './pages/login'
import VerifyPage from './pages/verify'
import BasicInfoPage from './pages/basicInfo'
import ProfilePage from './pages/profile'
function App(){
    return(
        <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage/>} />
            <Route path="/verify" element={<VerifyPage />} />
          <Route path="/basic-info" element={<BasicInfoPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/conversations" element={<ConversationsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
          {/* <Route path="/personal" element={<PersonalPage />} /> */}
          
        </Routes>
    )
}
export default App;
