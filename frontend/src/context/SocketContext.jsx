import { createContext, useState, useEffect, useContext } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const { user, loading } = useContext(AuthContext);

  useEffect(() => {
    // Only attempt connection if authenticated
    if (user && !loading) {
      const token = localStorage.getItem('accessToken');
      
      const socketInstance = io(import.meta.env.VITE_API_BASE || 'http://localhost:5000', {
        auth: {
          token
        }
      });

      setSocket(socketInstance);

      socketInstance.on('connect', () => setIsConnected(true));
      socketInstance.on('disconnect', () => setIsConnected(false));
      socketInstance.on('getOnlineUsers', (users) => {
        setOnlineUsers(users);
      });

      return () => {
        socketInstance.off('connect');
        socketInstance.off('disconnect');
        socketInstance.off('getOnlineUsers');
        socketInstance.close();
      };
    } else if (!user && !loading) {
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
    }
  }, [user, loading]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
