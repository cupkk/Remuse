import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';
import NfcGiftExperience, { isNfcGiftExperiencePath } from './components/NfcGiftExperience';
import { registerGlobalClientErrorHandlers } from './services/clientErrorReporter';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
registerGlobalClientErrorHandlers();
const pathname = typeof window === 'undefined' ? '/' : window.location.pathname;
const RootApp = isNfcGiftExperiencePath(pathname) ? NfcGiftExperience : App;

root.render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
