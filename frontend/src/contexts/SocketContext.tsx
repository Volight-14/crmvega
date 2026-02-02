import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import io, { type Socket } from 'socket.io-client';
// import { useAuth } from './AuthContext'; // Not needed yet

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // const { token } = useAuth(); // Assuming useAuth provides token if needed for auth in future
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Avoid double connections
        if (socketRef.current) return;

        const socketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

        console.log('🔌 Initializing Global Socket Connection...');

        socketRef.current = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current.on('connect', () => {
            console.log('✅ Global Socket Connected ID:', socketRef.current?.id);
            setIsConnected(true);
        });

        socketRef.current.on('disconnect', (reason: string) => {
            console.log('❌ Global Socket Disconnected:', reason);
            setIsConnected(false);
        });

        socketRef.current.on('connect_error', (err: Error) => {
            console.error('⚠️ Global Socket Connection Error:', err);
            setIsConnected(false);
        });

        return () => {
            if (socketRef.current) {
                console.log('🔌 Disconnecting Global Socket...');
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
