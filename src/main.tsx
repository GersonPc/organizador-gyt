import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Organizer from '../app/page';
import '../app/globals.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el contenedor de la aplicación.');

createRoot(container).render(
  <StrictMode>
    <Organizer />
  </StrictMode>,
);
