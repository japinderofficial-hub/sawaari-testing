'use client';

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSawaariStore } from '../../lib/store';
import { initializeSocket, disconnectSocket } from '../../lib/socket';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  const token = useSawaariStore((state) => state.token);

  useEffect(() => {
    if (token) {
      // Connect sockets when user logs in
      initializeSocket(token);
    } else {
      // Disconnect when logged out
      disconnectSocket();
    }

    return () => {
      disconnectSocket();
    };
  }, [token]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
