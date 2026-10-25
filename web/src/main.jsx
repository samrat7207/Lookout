import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { registerOfflineShell } from './offline/register.js';

// No <StrictMode>: its dev double-mount races drei <Html> portals under React 19
// ("synchronously unmount a root while React was already rendering") and drops labels.
createRoot(document.getElementById('root')).render(<App />);
registerOfflineShell();
