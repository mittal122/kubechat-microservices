import { useContext, useState } from 'react';
import { SocketContext } from '../context/SocketContext';
import { api } from '../context/AuthContext';
import { LogOut, Search, User } from 'lucide-react';

const ChatSidebar = ({ conversations, setConversations, activeConversation, setActiveConversation, user, logout }) => {
  const { onlineUsers } = useContext(SocketContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.trim() === '') {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await api.get(`/users/search?query=${query}`);
      setSearchResults(res.data.users);
    } catch (error) {
      console.error("Search failed:", error);
      alert("Failed to search users. Check your connection.");
    }
  };

  const startNewChat = (targetUser) => {
    // Check if conversation already exists in our array
    const existing = conversations.find(c => c.otherUser?._id === targetUser._id);
    if (existing) {
      setActiveConversation(existing);
    } else {
      // Create a temporary object so ChatWindow can load. The backend will formalize the 'Conversation' on first message
      setActiveConversation({
        isNew: true, // Custom flag to indicate it hasn't mapped to a DB Conversation row yet
        otherUser: targetUser
      });
    }
    setSearchQuery('');
    setIsSearching(false);
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header Profile Area */}
      <div className="bg-transparent p-5 border-b border-white/30 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-[1.25rem] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg ring-2 ring-white/50">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <span className="font-bold text-gray-800 tracking-tight text-lg">{user.name}</span>
        </div>
        <button onClick={logout} className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-white/50 rounded-xl transition-all shadow-sm backdrop-blur-sm" title="Logout">
          <LogOut size={20} />
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-4 bg-transparent border-b border-white/30">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={handleSearch}
            className="w-full pl-11 pr-4 py-3 bg-white/50 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm text-sm focus:bg-white/80 focus:ring-2 focus:ring-indigo-300 transition-all outline-none font-medium placeholder-gray-400"
          />
        </div>
      </div>

      {/* Render Lists */}
      <div className="flex-1 overflow-y-auto px-2 py-3 bg-transparent space-y-1.5 custom-scrollbar">
        {isSearching ? (
          <div>
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Search Results</div>
            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No users found</div>
            ) : (
              searchResults.map(u => (
                <div 
                  key={u._id} 
                  onClick={() => startNewChat(u)}
                  className="flex items-center p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors"
                >
                   <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm">
                      {u.name.charAt(0).toUpperCase()}
                   </div>
                   <div className="ml-4 flex-1">
                     <h4 className="text-sm font-semibold text-gray-900">{u.name}</h4>
                     <p className="text-xs text-gray-500">{u.email}</p>
                   </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            {conversations.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center">
                <User size={48} className="text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">No chats yet.<br/>Search for someone to start!</p>
              </div>
            ) : (
              conversations.map(c => {
                const isOnline = onlineUsers.includes(c.otherUser?._id);
                const isActive = activeConversation?._id === c._id;
                
                return (
                  <div 
                    key={c._id} 
                    onClick={() => setActiveConversation(c)}
                    className={`flex items-center p-3.5 mx-1 cursor-pointer transition-all duration-300 rounded-[1.25rem] border ${
                      isActive 
                        ? 'bg-white/90 shadow-md ring-1 ring-indigo-200 border-transparent scale-[1.02]' 
                        : 'bg-white/40 border-white/50 hover:bg-white/70 hover:shadow-lg hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="relative">
                      <div className="w-[3.25rem] h-[3.25rem] rounded-[1rem] bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center text-gray-700 font-bold text-lg flex-shrink-0 shadow-inner overflow-hidden border border-white">
                        {c.otherUser?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      {isOnline && (
                        <span className="absolute -bottom-1 -right-1 block h-4 w-4 rounded-full ring-[3px] ring-white bg-green-500 shadow-sm transition-all animate-pulse"></span>
                      )}
                    </div>
                    
                    <div className="ml-4 flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <h4 className={`text-base font-bold tracking-tight truncate ${c.unreadCount > 0 ? 'text-gray-900' : 'text-gray-800'}`}>
                          {c.otherUser?.name || 'Unknown User'}
                        </h4>
                        <span className={`text-[11px] flex-shrink-0 ml-2 ${c.unreadCount > 0 ? 'text-red-500 font-bold' : 'text-gray-400 font-medium'}`}>
                          {formatTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className={`text-sm leading-snug truncate w-5/6 ${isActive ? 'text-indigo-600 font-medium' : (c.unreadCount > 0 ? 'text-gray-800 font-semibold' : 'text-gray-500')}`}>
                          {c.lastMessage}
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md ml-2 transform animate-bounce">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;
