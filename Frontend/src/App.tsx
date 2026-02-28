import './App.css';
import { Routes, Route } from 'react-router-dom';
// import PersonalPage from './pages/personalPage';
import ChatPage from './pages/chatPage';
import ConversationsPage from './pages/ConversationPage';
function App(){
    return(
        <Routes>
          <Route path="/" element={<ConversationsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          {/* <Route path="/personal" element={<PersonalPage />} /> */}
          <Route path="/conversations" element={<ConversationsPage />} />
        </Routes>
    )
}
export default App;
