import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './design-system/tokens.css';
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
                        background: '#FFFFFF',
                        color: '#1C1917',
                        border: '1px solid #E4E2DB',
                        borderRadius: '10px',
                        fontFamily: "'Instrument Sans', system-ui, sans-serif",
                        fontSize: '13px',
                        boxShadow: '0 4px 16px rgba(28,25,23,0.10)',
                    },
                    success: {
                        iconTheme: { primary: '#059669', secondary: '#ECFDF5' },
                    },
                    error: {
                        iconTheme: { primary: '#DC2626', secondary: '#FEF2F2' },
                    },
                }}
            />
        </QueryClientProvider>
    </React.StrictMode>
);
