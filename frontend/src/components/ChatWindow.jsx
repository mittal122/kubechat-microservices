import { useState, useEffect, useRef, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { api } from '../context/AuthContext';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { Circle } from 'lucide-react';

const ChatWindow = ({ conversation, liveMessage, currentUser, onMarkSeen, onClose }) => {
  const { socket, onlineUsers, isConnected } = useContext(SocketContext);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const otherUser = conversation?.otherUser;
  const isOnline = otherUser ? onlineUsers.includes(otherUser._id) : false;

  // 1. Fetch history on conversation change
  useEffect(() => {
    setHasInteracted(false);
    if (!conversation) return;
    if (conversation.isNew) { setMessages([]); return; }

    const fetchMessages = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/messages/${conversation._id}`);
        setMessages(res.data);
      } catch {
        console.error('Failed to fetch messages');
      } finally {
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
      }
    };
    fetchMessages();
  }, [conversation]);

  // 2. Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 3. Mark active on physical interaction
  const markChatActive = () => {
    if (!conversation || conversation.isNew) return;
    if (!hasInteracted) setHasInteracted(true);
    const hasUnseen = messages.some(m => m.receiverId === currentUser._id && m.status !== 'seen');
    if (!hasUnseen) return;
    api.put(`/messages/${conversation._id}/seen`).catch(console.error);
    if (onMarkSeen) onMarkSeen(conversation._id);
    setMessages(prev => prev.map(m =>
      m.receiverId === currentUser._id ? { ...m, status: 'seen', isSeen: true } : m
    ));
  };

  // 4. Live message from ChatPage
  useEffect(() => {
    if (liveMessage && activeCheck(liveMessage)) {
      setMessages(prev => {
        const exists = prev.some(msg => msg._id === liveMessage._id);
        if (exists) return prev;
        return [...prev, liveMessage];
      });
      if (hasInteracted) {
        api.put(`/messages/${conversation._id}/seen`).catch(console.error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMessage, hasInteracted]);

  const activeCheck = (msg) => {
    if (!conversation || conversation.isNew) return false;
    return msg.conversationId === conversation._id;
  };

  // 5. Socket listeners
  useEffect(() => {
    if (!socket || !conversation || conversation.isNew) return;

    const handleTyping = (room) => { if (room === conversation._id) setIsTyping(true); };
    const handleStopTyping = (room) => { if (room === conversation._id) setIsTyping(false); };

    const handleMessagesDelivered = (payload) => {
      if (otherUser && payload.receiverId === otherUser._id) {
        setMessages(prev => prev.map(m =>
          (m.senderId === currentUser._id && m.status === 'sent') ? { ...m, status: 'delivered' } : m
        ));
      }
    };

    const handleMessagesSeen = (payload) => {
      if (payload.conversationId === conversation._id) {
        setMessages(prev => prev.map(m =>
          m.senderId === currentUser._id ? { ...m, status: 'seen', isSeen: true } : m
        ));
      }
    };

    socket.emit('join chat', conversation._id);
    socket.on('typing', handleTyping);
    socket.on('stop typing', handleStopTyping);
    socket.on('messagesDelivered', handleMessagesDelivered);
    socket.on('messagesSeen', handleMessagesSeen);

    return () => {
      socket.off('typing', handleTyping);
      socket.off('stop typing', handleStopTyping);
      socket.off('messagesDelivered', handleMessagesDelivered);
      socket.off('messagesSeen', handleMessagesSeen);
    };
  }, [socket, conversation, currentUser._id, otherUser]);

  // 6. Smart auto-scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 160;
    if (isNearBottom || isTyping) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  // 7. Send message
  const handleSendMessage = async (text) => {
    if (!otherUser) return;
    try {
      const res = await api.post(`/messages/${otherUser._id}`, { text });
      setMessages(prev => {
        const exists = prev.some(msg => msg._id === res.data._id);
        if (exists) return prev;
        return [...prev, res.data];
      });
      if (conversation.isNew) window.location.reload();
    } catch {
      alert('Failed to send message. Please try again.');
    }
  };

  if (!conversation) return null;

  return (
    <div
      className="flex flex-col h-full w-full chat-appear"
      onClickCapture={markChatActive}
      onFocusCapture={markChatActive}
    >
      {/* ── Header: LEFT | CENTER | RIGHT ── */}
      <div className="flex items-center px-6 py-4 border-b border-white/6 bg-white/3 backdrop-blur-sm flex-shrink-0">

        {/* LEFT — Avatar + online dot */}
        <div className="flex items-center gap-3 w-1/3">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-700 border border-white/10 flex items-center justify-center text-white font-bold text-base">
              {otherUser?.name?.charAt(0).toUpperCase() || '?'}
            </div>
            {isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-slate-950" />
            )}
          </div>
        </div>

        {/* CENTER — Name + status perfectly centered */}
        <div className="w-1/3 text-center">
          <p className="text-white font-semibold text-base leading-tight tracking-wide">
            {otherUser?.name || 'Unknown'}
          </p>
          <p className={`text-xs font-medium mt-0.5 ${isOnline ? 'text-green-400' : 'text-white/30'}`}>
            {isOnline ? 'Active now' : 'Offline'}
          </p>
        </div>

        {/* RIGHT — Status indicators */}
        <div className="w-1/3 flex justify-end">
          {!isConnected && (
            <div className="text-[11px] font-bold text-orange-400 bg-orange-400/10 px-3 py-1 rounded-full animate-pulse">
              Reconnecting…
            </div>
          )}
        </div>

      </div>

      {/* ── Messages Canvas ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Circle size={28} className="text-white/20" />
              </div>
              <p className="text-white/30 text-sm">No messages yet — say hello!</p>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <MessageBubble
                  key={msg._id}
                  message={msg}
                  isOwnMessage={msg.senderId === currentUser._id}
                />
              ))}

              {isTyping && (
                <div className="flex justify-start mb-3">
                  <div className="bg-white/8 backdrop-blur-md border border-white/10 rounded-3xl rounded-tl-md px-5 py-3.5 flex gap-1.5 items-center">
                    {[0, 150, 300].map(delay => (
                      <div key={delay} className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      </div>

      {/* ── Input Area ── */}
      <MessageInput
        onSendMessage={handleSendMessage}
        conversationId={conversation.isNew ? null : conversation._id}
      />
    </div>
  );
};

export default ChatWindow;
