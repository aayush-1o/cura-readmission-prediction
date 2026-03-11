import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './index.css';
import { injectCSSVariables } from './design-system/tokens.js';

// Inject all design tokens as CSS custom properties before React renders
injectCSSVariables();

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,    // 5 min stale time
            retry: 2,
            refetchOnWindowFocus: false,
        },
    },
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
            <Toaster
                position="bottom-right"
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: '#1C2333',
                        color: '#F9FAFB',
                        border: '1px solid #1F2937',
                        borderRadius: '10px',
                        fontFamily: '"Inter", system-ui, sans-serif',
                        fontSize: '14px',
                    },
                    success: {
                        iconTheme: { primary: '#10B981', secondary: '#1C2333' },
                    },
                    error: {
                        iconTheme: { primary: '#EF4444', secondary: '#1C2333' },
                    },
                }}
            />
        </QueryClientProvider>
    </React.StrictMode>
);
