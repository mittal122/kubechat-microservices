import { useState, useEffect, useContext } from 'react';
import { AuthContext, api } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import ChatWindow from '../components/ChatWindow';
import { MessageSquare, Search, LogOut, X, User, Circle } from 'lucide-react';

const ChatPage = () => {
  const { user, logout } = useContext(AuthContext);
  const { socket, onlineUsers } = useContext(SocketContext);

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [liveMessage, setLiveMessage] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Synthetic notification ping
  const playNotificationPing = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.22);
    } catch (e) { /* silenced */ }
  };

  // Fetch conversations
  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/conversations');
        setConversations(res.data.map(c => ({ ...c, unreadCount: c.unreadCount || 0 })));
      } catch (e) {
        console.error('Failed to load conversations:', e);
      }
    };
    fetch();
  }, []);

  // Global new message socket listener
  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (message) => {
      if (activeConversation?._id === message.conversationId) {
        setLiveMessage(message);
      }
      setConversations(prev => {
        const idx = prev.findIndex(c => c._id === message.conversationId);
        const isActive = activeConversation?._id === message.conversationId;
        if (!isActive) playNotificationPing();
        if (idx > -1) {
          const updated = {
            ...prev[idx],
            lastMessage: message.text,
            lastMessageAt: message.createdAt,
            unreadCount: isActive ? 0 : (prev[idx].unreadCount || 0) + 1,
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        } else {
          api.get('/conversations').then(res =>
            setConversations(res.data.map(c => ({ ...c, unreadCount: c.unreadCount || 0 })))
          );
          return prev;
        }
      });
    };
    socket.on('newMessage', handleNewMessage);
    return () => socket.off('newMessage', handleNewMessage);
  }, [socket, activeConversation]);

  // Search users
  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) { setIsSearching(false); setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const res = await api.get(`/users/search?query=${q}`);
      setSearchResults(res.data.users);
    } catch { setSearchResults([]); }
  };

  const handleSelectConversation = (conv) => {
    setActiveConversation(conv);
    setShowOverlay(false);
    setSearchQuery('');
    setIsSearching(false);
    if (!conv.isNew) {
      setConversations(prev => prev.map(c => c._id === conv._id ? { ...c, unreadCount: 0 } : c));
    }
  };

  const startNewChat = (targetUser) => {
    const existing = conversations.find(c => c.otherUser?._id === targetUser._id);
    handleSelectConversation(existing || { isNew: true, otherUser: targetUser });
  };

  const handleMarkSeen = (conversationId) => {
    setConversations(prev => prev.map(c => c._id === conversationId ? { ...c, unreadCount: 0 } : c));
  };

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const formatTime = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!user) return null;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950">

      {/* Ambient background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[120px]" />
      </div>

      {/* ── Full-screen Chat Window or Welcome ── */}
      <div className="relative z-10 w-full h-full flex flex-col">
        {activeConversation ? (
          <ChatWindow
            key={activeConversation._id || 'new'}
            conversation={activeConversation}
            liveMessage={liveMessage}
            currentUser={user}
            onMarkSeen={handleMarkSeen}
            onClose={() => setActiveConversation(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-white/10 flex items-center justify-center mb-6 shadow-2xl">
              <MessageSquare size={40} className="text-violet-400" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
              KubeChat Microservices
            </h1>
            <p className="text-white/40 text-lg max-w-sm mb-8">
              Your conversations, beautifully focused.
            </p>
            <button
              onClick={() => setShowOverlay(true)}
              className="px-8 py-3.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold rounded-2xl shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-105 transition-all duration-200"
            >
              Open Conversations
            </button>
          </div>
        )}
      </div>

      {/* ── Floating Switcher Button ── */}
      <div className="fixed bottom-6 left-6 z-40 flex items-center gap-3">
        {/* User avatar */}
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-violet-500/20 text-sm">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <button
          onClick={() => setShowOverlay(prev => !prev)}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-semibold text-sm transition-all duration-300 shadow-lg ${
            showOverlay
              ? 'bg-white/15 text-white shadow-white/5 ring-1 ring-white/20'
              : 'bg-white/8 text-white/80 hover:bg-white/15 hover:text-white shadow-black/20'
          }`}
        >
          <MessageSquare size={17} />
          <span>Chats</span>
          {totalUnread > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {totalUnread}
            </span>
          )}
        </button>
        <button
          onClick={logout}
          className="w-10 h-10 rounded-2xl bg-white/8 text-white/50 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-all shadow-lg"
          title="Logout"
        >
          <LogOut size={17} />
        </button>
      </div>

      {/* ── Conversation Overlay Panel ── */}
      {showOverlay && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowOverlay(false)}
          />
          {/* Panel */}
          <div className="fixed bottom-24 left-6 z-50 w-[360px] max-h-[calc(100vh-140px)] bg-white/8 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden overlay-appear">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <h2 className="text-white font-bold text-base">Conversations</h2>
              <button onClick={() => setShowOverlay(false)} className="text-white/40 hover:text-white transition p-1 rounded-lg hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            {/* Search */}
            <div className="px-4 py-3 border-b border-white/8">
              <div className="flex items-center bg-white/8 rounded-xl px-3 py-2 gap-2 focus-within:ring-1 focus-within:ring-violet-500/50 transition-all">
                <Search size={16} className="text-white/30 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search people..."
                  value={searchQuery}
                  onChange={handleSearch}
                  className="bg-transparent text-white text-sm flex-1 outline-none placeholder-white/30"
                />
              </div>
            </div>
            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
              {isSearching ? (
                <>
                  <p className="px-5 py-2 text-[11px] uppercase tracking-wider text-white/30 font-semibold">People</p>
                  {searchResults.length === 0 ? (
                    <p className="px-5 py-3 text-white/30 text-sm">No users found</p>
                  ) : searchResults.map(u => (
                    <button
                      key={u._id}
                      onClick={() => startNewChat(u)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/8 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold">{u.name}</p>
                        <p className="text-white/40 text-xs">{u.email}</p>
                      </div>
                    </button>
                  ))}
                </>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-white/30">
                  <User size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">No conversations yet</p>
                </div>
              ) : (
                <>
                  <p className="px-5 py-2 text-[11px] uppercase tracking-wider text-white/30 font-semibold">Recent</p>
                  {conversations.map(c => {
                    const isOnline = onlineUsers.includes(c.otherUser?._id);
                    const isActive = activeConversation?._id === c._id;
                    return (
                      <button
                        key={c._id}
                        onClick={() => handleSelectConversation(c)}
                        className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-left ${
                          isActive ? 'bg-violet-500/20 ring-1 ring-violet-500/30 inset-0' : 'hover:bg-white/8'
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white font-bold text-base border border-white/10">
                            {c.otherUser?.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          {isOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-slate-950" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-0.5">
                            <p className="text-white text-sm font-semibold truncate">{c.otherUser?.name}</p>
                            <span className={`text-[11px] flex-shrink-0 ml-2 ${c.unreadCount > 0 ? 'text-violet-300 font-bold' : 'text-white/30'}`}>
                              {formatTime(c.lastMessageAt)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-white/40 text-xs truncate flex-1">{c.lastMessage || 'No messages yet'}</p>
                            {c.unreadCount > 0 && (
                              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0">
                                {c.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatPage;
