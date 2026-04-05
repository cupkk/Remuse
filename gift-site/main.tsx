import React from 'react';
import ReactDOM from 'react-dom/client';
import '../src/index.css';
import NfcGiftExperience from '../components/NfcGiftExperience';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount gift site');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <NfcGiftExperience basePath="/" />
  </React.StrictMode>,
);
