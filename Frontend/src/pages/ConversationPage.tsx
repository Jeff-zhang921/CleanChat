import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import "./ConversationPage.css";

type AvatarKey =
  | "AVATAR_LEO"
  | "AVATAR_SOPHIE"
  | "AVATAR_MAX"
  | "AVATAR_BELLA"
  | "AVATAR_CHARLIE";

type UserSummary = {
  id: number;
  name: string | null;
  email: string;
  avatar: AvatarKey;
};

type SessionUser = UserSummary & {
  cleanId?: string | null;
};

//this is same with the API with backend
type ThreadResponse = {
  id: number;
  AID: number;
  BID: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  UserA: UserSummary;
  UserB: UserSummary;
  Messages: {
    id: number;
    body: string;
    createdAt: string;
    senderId: number;
  }[];
};

const BACKEND_URL = "http://localhost:4000";
const AVATAR_URLS: Record<AvatarKey, string> = {
  AVATAR_LEO: "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo",
  AVATAR_SOPHIE: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie",
  AVATAR_MAX: "https://api.dicebear.com/7.x/avataaars/svg?seed=Max",
  AVATAR_BELLA: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bella",
  AVATAR_CHARLIE: "https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie",
};

const getAvatarUrl = (avatar?: AvatarKey) => {
  if (!avatar) return AVATAR_URLS.AVATAR_LEO;
  return AVATAR_URLS[avatar] ?? AVATAR_URLS.AVATAR_LEO;
};

const formatTime=(time?:string)=>{
  if(!time)return "New"
  const date=new Date(time)
  if (Number.isNaN(date.getTime())) return "New";
  return date.toLocaleDateString();
}

const ConversationPage=()=>{
  //强制传送：用户干了某件事，你强行把他传走。
  const navigate=useNavigate()

  const [me,setme]=useState<SessionUser|null>(null)
  const[thread,setThread]=useState<ThreadResponse[]>([])
  const [status,setStatus]=useState("loading...")
  const [searchTerm, setSearchTerm] = useState("");
  //async function is use to let function inside and outside async func to run when async is running, no need to wait
  //await only contain inside async func
  //await is use when function inside async meet await, it need to wait until the await func to finish to execute next. outside is not affected

 useEffect(()=>{
  //usecase of mount:这个组件还在屏幕上吗(is this component still on the screen), if don't, throw the data
  let isMounted=true
  const load=async()=>{
    try{
      //fetch url
        const meRes = await fetch(`${BACKEND_URL}/auth/me`, {
          credentials: "include",
        });
        if(!meRes.ok){
          if(isMounted)setStatus("please login to see the conversation")
            return
        }

        const meData=await meRes.json()
        if(isMounted) setme(meData.user??null)

          const threadRespond=await fetch(`${BACKEND_URL}/chat/threads`,{
            credentials:"include"
          })
          if(!threadRespond.ok){
            const data=await threadRespond.json().catch(()=>{"error occur when fetching threads!"})
            if(isMounted)setStatus(data.message||"Fail to load conversation")
              return
          }
          const data=await threadRespond.json()
          if(isMounted) {
            setThread(Array.isArray(data)?data:[])
            setStatus("")
          }
    }
   catch{
            if (isMounted) setStatus("Failed to load conversations.");
  }
  }
  load()
  return()=>{
    isMounted=false
  }
 },[])


//Please remember the result of this calculation and don't redo the work unless it is absolutely necessary.
//list out all the user thread
const conversations=useMemo(()=>{
if(!me)return []
const mapped =thread.map((thread)=>{
  const isA=thread.AID===me.id
  const other=isA?thread.UserB:thread.UserA
  const latestMessage = thread.Messages?.[0] ?? null;
  const displayName = other.name || other.email;
  return {
    threadId:thread.id,
    name:displayName,
    email:other.email,
    avatarUrl:getAvatarUrl(other.avatar),
    role:"Direct",
    preview: latestMessage?.body || "No messages yet.",
    time:formatTime(latestMessage?.createdAt || thread.lastMessageAt || thread.updatedAt),
  }
}
)
return mapped
},[thread,me])

const filteredConversations = useMemo(() => {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return conversations;
  return conversations.filter((item) =>
    item.name.toLowerCase().includes(query)
  );
}, [conversations, searchTerm]);

const handleOpenThread = (threadId: number,other:string) => {
    navigate("/chat", { state: { threadId, other} });
  };


return(
    <div className="conversations-page">
      <div className="conversations-shell">
        <header className="conversations-header">
          <div>
            <p className="eyebrow"></p>
            <h1>{me?.cleanId || me?.email}</h1>
          </div>
        </header>
        <div className="conversations-toolbar">
          <div className="search-field">
            <label className="conversation-search">Search</label>
            <input
              id="conversation-search"
              type="text"
              placeholder="Search by name or event"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        <div className="conversations-meta">
          <h2>
           Messages
          </h2>
        </div>
        

        {status && <div>{status}</div>}
        {!status && conversations.length === 0 && (
          <div>No conversations yet.</div>
        )}
        {!status && conversations.length > 0 && filteredConversations.length === 0 && (
          <div>
            No conversations match "{searchTerm.trim()}".
          </div>
        )}
        {/* section: It tells the browser (and search engines) that "everything inside this box belongs to one specific theme." */}
         <section className="conversations-list">
          {filteredConversations.map((item) => (
            // If you "cut" an article out of your website and put it on a different page, it should still make sense by itself.
            <article
              key={item.threadId}
              className="conversation-card"
              onClick={() => handleOpenThread(item.threadId,item.email)}
              role="button"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  handleOpenThread(item.threadId, item.email);
                }
              }}
            >
              <div className="avatar">
                <img src={item.avatarUrl} alt={`${item.name} avatar`} />
              </div>
              <div className="conversation-body">
                <div className="conversation-top">
                  <h3>{item.name}</h3>
                    <p className={"role"}>
                    {item.role}
                  </p>
                  <span className="time">{item.time}</span>
                </div>
                <p className="preview">{item.preview}</p>
              </div>
            </article>
          ))}
        </section>

    </div>
    <BottomNav />
  </div>
)


}

export default ConversationPage


