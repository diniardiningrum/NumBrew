import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { hydrateGame, startRuntime } from './store/gameStore';
import './styles/global.css';
import './styles/readability.css';
import './styles/customer-service.css';

hydrateGame();
const stopRuntime = startRuntime();
if (import.meta.hot) import.meta.hot.dispose(stopRuntime);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
