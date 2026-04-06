import { Check, CheckCheck } from 'lucide-react';

const MessageBubble = ({ message, isOwnMessage }) => {
  const formatTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex w-full mb-3 bubble-appear ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[72%] flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
        <div className={`px-5 py-3 rounded-3xl shadow-lg leading-relaxed text-[15px] break-words transition-all ${
          isOwnMessage
            ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-tr-md'
            : 'bg-white/8 backdrop-blur-md border border-white/10 text-white/90 rounded-tl-md'
        }`}>
          {message.text}
        </div>
        {/* Timestamp + Ticks */}
        <div className={`flex items-center gap-1 mt-1 px-1 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[11px] text-white/30 font-medium">{formatTime(message.createdAt)}</span>
          {isOwnMessage && (
            <span>
              {(message.status === 'seen' || message.isSeen) ? (
                <CheckCheck size={13} className="text-violet-300" strokeWidth={2.5} />
              ) : message.status === 'delivered' ? (
                <CheckCheck size={13} className="text-white/30" strokeWidth={2.5} />
              ) : (
                <Check size={13} className="text-white/30" strokeWidth={2.5} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
