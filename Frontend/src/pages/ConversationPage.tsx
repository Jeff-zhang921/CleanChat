import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ConversationPage.css";

type UserSummary = {
  id: number;
  name: string | null;
  email: string;
};

//this is same with the API with backend
type ThreadResponse = {
  id: number;
  hostId: number;
  guestId: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  host: UserSummary;
  guest: UserSummary;
  // current backend shape from /chat/threads
  Messages?: {
    id: number;
    body: string;
    createdAt: string;
    senderId: number;
  }[];
  // optional legacy/alternate shape
  lastMessage?: {
    id: number;
    body: string;
    createdAt: string;
    senderId: number;
  } | null;
};

const BACKEND_URL = "http://localhost:3000";
//accent is used for the avater
const ACCENTS = ["#1f98b0", "#c43642", "#cb7e4a", "#37c9b8", "#7743ac", "#42a679"];

const getInitials=(name:string)=>{
  const parts=name.split(" ").filter(Boolean)
  if (parts.length===0)return'Unknown'
   return parts.join(" ")
}
const formatTime=(time?:string)=>{
  if(!time)return "New"
  const date=new Date(time)
  if (Number.isNaN(date.getTime())) return "New";
  return date.toLocaleDateString();
}

const ConversationPage=()=>{
  //强制传送：用户干了某件事，你强行把他传走。
  const navigate=useNavigate()

  const [me,setme]=useState<UserSummary|null>(null)
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
  const isHost=thread.hostId===me.id
  const other=isHost?thread.guest:thread.host
  //fall back chain 
  const latestMessage = thread.lastMessage ?? thread.Messages?.[0] ?? null;
  //make sure they are different 
  const accent=ACCENTS[other.id%ACCENTS.length]
  return {
    threadId:thread.id,
    name:other.name||other.email,
    email:other.email,
    role:isHost? "Host":"Guest",
    preview: latestMessage?.body || "No messages yet.",
    time:formatTime(latestMessage?.createdAt),
    accent,
  }
}
)
return mapped
},[thread,me])

const filteredConversations = useMemo(() => {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return conversations;
  return conversations.filter((item) =>
    item.name.includes(query)
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
            <h1>{me?.email}</h1>
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
              style={{ ["--accent" as any]: item.accent }}
              onClick={() => handleOpenThread(item.threadId,item.email)}
              role="button"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  handleOpenThread(item.threadId, item.email);
                }
              }}
            >
              <div className="avatar">
                {/*  span doesn't do anything*/}
                <span>{getInitials(item.name[0])}</span>
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
  </div>
)


}

export default ConversationPage


