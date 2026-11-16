import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('m-enter');setTimeout(()=>document.documentElement.classList.add('m-enter-done'),700);}

createRoot(document.getElementById('root')).render(<React.StrictMode><React.Suspense fallback={<main className="ac-loading" role="status">Opening your workspace…</main>}><App /></React.Suspense></React.StrictMode>);

import './experience.css';
