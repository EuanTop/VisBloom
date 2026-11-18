import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useEffect, useState } from 'react';
import { subscribeConnection } from './api';
function ConnectedApp(){const [generation,setGeneration]=useState(0);useEffect(()=>subscribeConnection(()=>setGeneration(n=>n+1)),[]);return <App key={generation}/>;}
import './styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><ConnectedApp /></React.StrictMode>);
