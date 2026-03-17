import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { App } from './App';
import { Hub } from './components/Hub/Hub';
import { Level1Confirmshaming } from './levels/Level1Confirmshaming/Level1Confirmshaming';
import { Level2RoachMotel } from './levels/Level2RoachMotel/Level2RoachMotel';
import { Level3ForcedContinuity } from './levels/Level3ForcedContinuity/Level3ForcedContinuity';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Hub />} />
          <Route path="levels/1" element={<Level1Confirmshaming />} />
          <Route path="levels/2" element={<Level2RoachMotel />} />
          <Route path="levels/3" element={<Level3ForcedContinuity />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
