import { useState, useRef, useEffect, useContext } from 'react';
import { Send, Smile, X } from 'lucide-react';
import { SocketContext } from '../context/SocketContext';
import EmojiPicker from 'emoji-picker-react';

const MessageInput = ({ onSendMessage, conversationId }) => {
  const [text, setText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { socket } = useContext(SocketContext);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  const onEmojiClick = (emojiObject) => {
    setText(prev => prev + emojiObject.emoji);
    inputRef.current?.focus();
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (socket && conversationId) socket.emit('stop typing', conversationId);
    setIsTyping(false);
    setShowEmojiPicker(false);
    onSendMessage(text);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    if (!conversationId || !socket) return;
    if (!isTyping) { socket.emit('typing', conversationId); setIsTyping(true); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop typing', conversationId);
      setIsTyping(false);
    }, 1500);
  };

  useEffect(() => () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); }, []);

  const canSend = text.trim().length > 0;

  return (
    <div className="flex-shrink-0 px-4 pb-6 pt-3 relative">
      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 shadow-2xl rounded-2xl overflow-hidden border border-white/10">
          <EmojiPicker
            onEmojiClick={onEmojiClick}
            theme="dark"
            style={{ border: 'none', borderRadius: '1rem' }}
          />
        </div>
      )}

      {/* Input bar */}
      <div className="max-w-3xl mx-auto flex items-center gap-3 bg-white/6 backdrop-blur-xl border border-white/10 rounded-3xl px-4 py-3 shadow-2xl shadow-black/30 focus-within:border-violet-500/40 focus-within:bg-white/8 transition-all duration-300">
        {/* Emoji toggle */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(p => !p)}
          className={`flex-shrink-0 p-1.5 rounded-xl transition-all ${
            showEmojiPicker
              ? 'text-violet-400 bg-violet-500/15'
              : 'text-white/30 hover:text-white/70 hover:bg-white/8'
          }`}
        >
          {showEmojiPicker ? <X size={20} /> : <Smile size={20} />}
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message…"
          value={text}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-white placeholder-white/25 outline-none text-[15px] font-medium"
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          className={`flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center transition-all duration-200 ${
            canSend
              ? 'bg-gradient-to-tr from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:scale-110 hover:shadow-violet-500/50 active:scale-95'
              : 'bg-white/6 text-white/20 cursor-not-allowed'
          }`}
        >
          <Send size={16} className={canSend ? 'translate-x-px' : ''} />
        </button>
      </div>
    </div>
  );
};

export default MessageInput;
