import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WelcomePage } from './pages/WelcomePage';
import { App } from './App';
import { Hub } from './components/Hub/Hub';
import { Level1Confirmshaming } from './levels/Level1Confirmshaming/Level1Confirmshaming';
import { Level2RoachMotel } from './levels/Level2RoachMotel/Level2RoachMotel';
import { Level3ForcedContinuity } from './levels/Level3ForcedContinuity/Level3ForcedContinuity';
import { Level4TrickWording } from './levels/Level4TrickWording/Level4TrickWording';
import { Level5Preselection } from './levels/Level5Preselection/Level5Preselection';
import { Level6BasketSneaking } from './levels/Level6BasketSneaking/Level6BasketSneaking';
import { Level7Nagging } from './levels/Level7Nagging/Level7Nagging';
import { Level8InterfaceInterference } from './levels/Level8InterfaceInterference/Level8InterfaceInterference';
import { Level9Zuckering } from './levels/Level9Zuckering/Level9Zuckering';
import { Level10EmotionalManipulation } from './levels/Level10EmotionalManipulation/Level10EmotionalManipulation';
import { Level11SpeedTrap } from './levels/Level11SpeedTrap/Level11SpeedTrap';
import { Level12FlashRecall } from './levels/Level12FlashRecall/Level12FlashRecall';
import { Level13NeedleHaystack } from './levels/Level13NeedleHaystack/Level13NeedleHaystack';
import { ChallengeModeProvider } from './challengeMode';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/:userId" element={<ChallengeModeProvider enabled><App /></ChallengeModeProvider>}>
          <Route index element={<Hub />} />
          <Route path="levels/1" element={<Level1Confirmshaming />} />
          <Route path="levels/2" element={<Level2RoachMotel />} />
          <Route path="levels/3" element={<Level3ForcedContinuity />} />
          <Route path="levels/4" element={<Level4TrickWording />} />
          <Route path="levels/5" element={<Level5Preselection />} />
          <Route path="levels/6" element={<Level6BasketSneaking />} />
          <Route path="levels/7" element={<Level7Nagging />} />
          <Route path="levels/8" element={<Level8InterfaceInterference />} />
          <Route path="levels/9" element={<Level9Zuckering />} />
          <Route path="levels/10" element={<Level10EmotionalManipulation />} />
          <Route path="levels/11" element={<Level11SpeedTrap />} />
          <Route path="levels/12" element={<Level12FlashRecall />} />
          <Route path="levels/13" element={<Level13NeedleHaystack />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
