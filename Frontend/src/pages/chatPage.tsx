import { type ChangeEvent, useEffect, useRef, useState } from "react";
import{useLocation,useNavigate}from"react-router-dom";
import{io,type Socket}from "socket.io-client"
import { BACKEND_URL, SOCKET_URL } from "../config";
import { getNotificationPermission, showMessageNotification } from "../utils/notifications";
//chatPage/css has not been commited.
import"./chatPage.css"



type ChatMessage={
  id:number;
  threadId:number;
  senderId:number;
  body:string;
  createdAt:string
}

const IMAGE_MESSAGE_PREFIX = "IMG::";
const IMAGE_URL_REGEX =
  /^https:\/\/(?:utfs\.io|(?:[a-z0-9-]+\.)?ufs\.sh|[^/\s]*uploadthing\.com)\//i;
const IMAGE_EXTENSION_REGEX =
  /\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)(?:\?.*)?$/i;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

const getImageUrlFromMessage = (body: string) => {
  const trimmedBody = body.trim();
  const normalizedBody = trimmedBody.startsWith(IMAGE_MESSAGE_PREFIX)
    ? trimmedBody.slice(IMAGE_MESSAGE_PREFIX.length).trim()
    : trimmedBody;

  if (!normalizedBody || !isHttpUrl(normalizedBody)) {
    return null;
  }

  if (IMAGE_URL_REGEX.test(normalizedBody) || IMAGE_EXTENSION_REGEX.test(normalizedBody)) {
    return normalizedBody;
  }

  return null;
};

const formatNotificationBody = (body: string) =>
  getImageUrlFromMessage(body) ? "sent a photo" : body;

//TIMELINE:
//0ms	React reads useState(remember in memory).	Blank screen.
//10ms	React hits the Bottom Return.	"Not connected" (The empty shell).
//20ms	React looks back at useEffect.	[]
//30ms	connectSocket() runs.	"Not connected".
//100ms	Socket connects! setStatus("connected") is called.	"connected" (The screen updates).
//when you call setMessage,setStatus... it will rerender, rerun useEffect but if manager found it run before, and nothing change in [] so it won't run it


const ChatPage = () => {
  const location=useLocation()
  const locationState = (location.state as { other?: string; avatarUrl?: string } | null) ?? null;
  const other = locationState?.other ?? "";
  const avatarUrl = locationState?.avatarUrl ?? "";
  const navigate=useNavigate()
  //bring extra info the previous page tried to send.
  const socketRef=useRef<Socket|null>(null);
  //useRef is like a box that holds a value, but changing what’s inside does not tell React to redraw the screen.
  //when refresh the page, stuff inside will not vanish. to call the stuff inside call var.current
  //when call <div className="chat-body" ref={messageListRef}>, it wll do 
  //messageListRef.current = <the actual div DOM node>: the stuff that inside the div will auto scroll or do some action
  const messageListRef=useRef<HTMLDivElement|null>(null)
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const threadIdRef = useRef<number | null>(null);
  //change a useState value, React rerender the UI to show the new information."
  const [status,setStatus]=useState("Not connected")
  const [threadId,setThreadId]=useState<number|null>(null)
  const [message,setMessages]=useState<ChatMessage[]>([])

  //<> is the generic: this box is empty right now (null), but eventually, it is going to hold an object with an id, an email, and a name. Please get the memory ready for that
  const [me, setMe] = useState<{ id: number; email: string; name: string | null } | null>(null);
  const meRef = useRef<{ id: number; email: string; name: string | null } | null>(null);
  const autoThreadRef=useRef(false)
//useEffect: After you finish drawing the screen, run this specific piece of code.
const [messageBody,setMessageBody]=useState("")
const [isUploadingImage, setIsUploadingImage] = useState(false);
const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

const refocusMessageInput = () => {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    messageInputRef.current?.focus({ preventScroll: true });
  });
};



const loadMe=async()=>{
  try{
    const res=await fetch(`${BACKEND_URL}/auth/me`,{
      credentials:"include"
    })
    if(!res.ok){
      setMe(null)
      return null
    }
    const data=await res.json();
    setMe(data.user||null)
    meRef.current = data.user || null
    return data.user||null

  }catch{
    setMe(null)
    meRef.current = null
    return null
  }
}
//Async/Await: The code pauses at the await line. It waits for the server to send back the user data. Only once it has the data in its "hands" does it move to the next line to connect the socket.




const loadMessages=async(id:number)=>{
  try{
    const res = await fetch(`${BACKEND_URL}/chat/threads/${id}/messages`, {
     credentials: "include",
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(data.message || "Failed to load messages.");
        return;
      }
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setStatus("Failed to load messages.");
    }
  }




  
//connect to socket function
const connectSocket=()=>{
  //check if already connect
 if (socketRef.current)return
 //normal http open and close in each request
 //io Stays open as long as you're on the page.
 //The Verification (Sending)
 const socket=io(SOCKET_URL,{withCredentials:true})
socketRef.current=socket
//connect is a reserved keyword in socket unlike thread:id
//when they connect it will execute the following code
  socket.on("connect",()=>{
  setStatus("Connected")
  const activeThreadId = threadIdRef.current;
  if(activeThreadId){
    //tells the server put the user in the thread room
    socket.emit("thread:join", { threadId: activeThreadId });
    loadMessages(activeThreadId);
  }
 })

  socket.on("connect_error", () => {
      setStatus("Socket connection error.");
    });

  socket.on("chat:error", (msg: string) => {
      setStatus(msg || "Chat error.");
    });
//socket.on is the listener
  socket.on("message:new", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      const currentUser = meRef.current;
      if (
        currentUser &&
        msg.senderId !== currentUser.id &&
        typeof document !== "undefined" &&
        document.hidden &&
        getNotificationPermission() === "granted"
      ) {
        const title = other || "New message";
        showMessageNotification(title, formatNotificationBody(msg.body), `thread-${msg.threadId}`);
      }
    });
  }



//the rules say []. This means 'Only run the code inside if the stuff in these brackets has changed since the last time I was here.'"
//The Reality: "Since there is nothing in the brackets, nothing could have changed. I'm not even going to open this door. Skip it!"
//this useeffect is to connect to the socket
  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(()=>{
   ( async()=>{
      const user=await loadMe()
      if (user)connectSocket()
    })()
  return()=>{
     if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
     }
  }
  },[])


  //this useEffect is to join the chat and load
    useEffect(()=>{
    if(!threadId) return
    loadMessages(threadId)
    if (socketRef.current?.connected) {
      socketRef.current.emit("thread:join",{threadId})
    }
  },[threadId ])  


//this is use to handle the visual scrolling and 
 useEffect(()=>{
  //If the box is still empty (because the screen hasn't finished drawing), stop here
  if(!messageListRef.current)return 

  messageListRef.current.scrollTo({
    top:messageListRef.current.scrollHeight,
  })
 },[message])


 const createThreadForHostId=async(rawHostId:number)=>{
  const parsed=Number(rawHostId)
  if (!Number.isInteger(parsed)||parsed<=0){
    setStatus("HostNumber must valid")
    return
  }
  //when you call setstatus, or set... it immediately broadcast
  try{
    const res=await fetch(`${BACKEND_URL}/chat/threads`,{
      method:"POST",
      headers: { "Content-Type": "application/json" },
      credentials:"include",
      body:JSON.stringify({hostId:parsed}),
    })
    const data=await res.json()
    if(!res.ok){
      setStatus(data.message||"fail to create thread")
      return
    }
    // Backend returns { thread: {...} } for both create and existing thread.
    const createdThreadId =
      typeof data?.thread?.id === "number"
        ? data.thread.id
        : typeof data?.threadId === "number"
          ? data.threadId
          : null
    if (!createdThreadId) {
      setStatus("Thread created but thread ID is missing")
      return
    }
    setThreadId(createdThreadId)
    setStatus("Thread Ready")
  }catch{
    setStatus("Failed to create thread")
  }
 }
//  const handleCreateThread=async()=>{
//    const parsed=Number(hostId)
//    await createThreadForHostId(parsed)
//  }


//i need hostId threadId from last page
//location is the suitcase that you bring other stuff into thispage
//the info is store in Ref so next time render it can stil remember
useEffect(()=>{
  const state=location.state as{hostId?:number;threadId?:number}|null
  if(!state||autoThreadRef.current)return
  if(state.threadId){
    autoThreadRef.current=true
    setThreadId(state.threadId)
    setStatus("thread ready")
    return
  }
  if(state.hostId){
    autoThreadRef.current=true
    createThreadForHostId(state.hostId)
  }
},[location.state])

const handleSendMessage=()=>{
  //socketRef is the container for socket
  if(!socketRef.current||!socketRef.current.connected){
    setStatus("socket Not conencted")
    return
  }
  if (!threadId){
    setStatus("create or join a thread first")
    return
  }
  const trimmed=messageBody.trim()
  if (!trimmed){
    setStatus("mesage cannot be empty")
    return
  }
  socketRef.current.emit("message:send",{
    threadId,body:trimmed
  })
  //The message is gone; now make the paper blank again
  setMessageBody("")
  refocusMessageInput();
}

const handleUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("Only image files are allowed.");
    return;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    setStatus("Image is too large. Please upload a file up to 15MB.");
    return;
  }

  if (!threadId) {
    setStatus("Create or join a thread first");
    return;
  }
  if (!socketRef.current || !socketRef.current.connected) {
    setStatus("Socket not connected");
    return;
  }

  const formData = new FormData();
  formData.append("image", file);

  setIsUploadingImage(true);
  setStatus("Uploading image...");

  try {
    const response = await fetch(`${BACKEND_URL}/chat/upload-image`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    const raw = await response.text();
    let data: Record<string, string> = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as Record<string, string>;
      } catch {
        data = {};
      }
    }

    if (!response.ok) {
      setStatus(
        data.error ||
          data.message ||
          raw ||
          `Failed to upload image (HTTP ${response.status}).`
      );
      return;
    }

    const imageUrl = typeof data.url === "string" ? data.url.trim() : "";
    if (!imageUrl) {
      setStatus("Upload succeeded but image URL is missing");
      return;
    }

    socketRef.current.emit("message:send", {
      threadId,
      body: `${IMAGE_MESSAGE_PREFIX}${imageUrl}`,
    });
    setStatus("Image sent");
    refocusMessageInput();
  } catch {
    setStatus("Failed to upload image");
  } finally {
    setIsUploadingImage(false);
  }
};

const handleOpenImagePreview = (imageUrl: string) => {
  setPreviewImageUrl(imageUrl);
};

const handleCloseImagePreview = () => {
  setPreviewImageUrl(null);
};

useEffect(() => {
  if (!previewImageUrl) return;

  const handleEsc = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      handleCloseImagePreview();
    }
  };

  window.addEventListener("keydown", handleEsc);
  return () => {
    window.removeEventListener("keydown", handleEsc);
  };
}, [previewImageUrl]);

  return (
    <div className='chat-shell'>
      <main className='chat-panel'>
        {/* finds the messageListRef object, and sets: messageListRef.current = [The actual HTML div element] */}
        <div className='chat-bar'>
          <button 
          type='button'
          className='back-button'
          onClick={()=>navigate(-1)}
          >
           ⤺
          </button>
          <span className='avatar'>
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${other || "User"} avatar`} />
            ) : (
              other ? other[0].toUpperCase() : "?"
            )}
          </span>
          <span>{other}</span>
        </div>
        <div  className='chat-body' ref={messageListRef}>

          {/* Somewhere near the top of the chat panel */}

           <div className={`status-pill ${socketRef.current?.connected ? "online" : ""}`}>
               {status}
                </div>

          {/* this is the checkgate, check whetjer it is 0 or null... for threadid  if check pass, render the next thing*/}
          {threadId && (
            <div className='chat-date'>{new Date().toLocaleString()}</div>
          )}

          {message.length === 0 && (
            <div>Start a conversation</div>
          )}
          
          {message.map((msg, index) => {
            const isMe = msg.senderId === me?.id;
            const imageUrl = getImageUrlFromMessage(msg.body);
            //If True: It gives the div the class chat-row me.
            //If False: It gives the div the class chat-row them.
            return (
              <div
              key={msg.id}
              className={`chat-row ${isMe?"me":"them"}`}
              //{ color: "red", fontSize: "16px" }
              //{ --i: 0 } <i style="color: red;">
              //using --i so each chat message is in different i
              >
                 <div className={`chat-bubble ${isMe ? "bubble-me" : "bubble-them"}`}>
                  {imageUrl ? (
                    <button
                      type="button"
                      className="chat-image-button"
                      onClick={() => handleOpenImagePreview(imageUrl)}
                    >
                      <img className="chat-image" src={imageUrl} alt="Shared image" />
                    </button>
                  ) : (
                    <p>{msg.body}</p>
                  )}
                  <span className="chat-timestamp">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>


        <div className='chat-input'>
          <input
            id="chat-photo-input"
            type="file"
            accept="image/*,.heic,.heif"
            className="chat-file-input"
            onChange={handleUploadImage}
            disabled={isUploadingImage}
          />
          <label
            htmlFor="chat-photo-input"
            className={`photo-button ${isUploadingImage ? "disabled" : ""}`}
            aria-disabled={isUploadingImage}
            onClick={(event) => {
              if (isUploadingImage) {
                event.preventDefault();
              }
            }}
          >
            {isUploadingImage ? "Uploading..." : "Photo"}
          </label>
          {/* <button type="button" className="input-icon" >
          </button> */}
          <input
            type="text"
            placeholder="Messages..."
            value={messageBody}
            ref={messageInputRef}
          // e.target.value: This is the exact text currently sitting inside the input box.
          //e is the key(键位) that user press
          //it is use when enter text to the input board
            onChange={(e) => setMessageBody(e.target.value)}
         //it is use when press enter or functional key in keyboard
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                //prevent the default of what it will do 
                e.preventDefault();
                //do the stuff that i assign to
                handleSendMessage();
              }
            }}
          />
           {/* <button type="button" className="input-icon">
          </button> */}
          <button
            type="button"
            className="send-button"
            onClick={handleSendMessage}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={(event) => event.preventDefault()}
            disabled={isUploadingImage}
          >
            Send
          </button>
        </div>
        {previewImageUrl && (
          <div className="image-viewer-overlay" onClick={handleCloseImagePreview} role="presentation">
            <div
              className="image-viewer-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <img className="image-viewer-image" src={previewImageUrl} alt="Preview" />
              <div className="image-viewer-actions">
                <a
                  className="image-viewer-btn"
                  href={previewImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                >
                  Save / Open
                </a>
                <button type="button" className="image-viewer-btn secondary" onClick={handleCloseImagePreview}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ChatPage;
