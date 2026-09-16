import { createContext, useState, useEffect } from 'react';

export const ThemeContext = createContext();

const STORAGE_KEY = 'theme';

function getInitialTheme() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
    } catch {
        // localStorage unavailable (private browsing, etc.) — fall through to OS preference
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Class-based (not media-query-based) dark mode: a POS is an all-day work
// screen, and staff should be able to pick a theme deliberately rather than
// only inherit whatever the OS happens to be set to. Falls back to the OS
// preference only on first visit, before any explicit choice is stored.
export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(getInitialTheme);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // per-viewer convenience only — theme still applies for this session
        }
    }, [theme]);

    const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
