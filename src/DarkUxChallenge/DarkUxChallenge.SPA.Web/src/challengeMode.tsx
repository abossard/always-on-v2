import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { useParams } from 'react-router-dom';

type ChallengeModeContextValue = {
  enabled: boolean;
};

const ChallengeModeContext = createContext<ChallengeModeContextValue>({ enabled: false });

export function ChallengeModeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return (
    <ChallengeModeContext.Provider value={{ enabled }}>
      {children}
    </ChallengeModeContext.Provider>
  );
}

export function useChallengeMode() {
  return useContext(ChallengeModeContext);
}

export function buildStartPath(userId: string, challengeMode: boolean) {
  return challengeMode ? `/challenge/${userId}` : `/${userId}`;
}

export function useAppPaths() {
  const { enabled } = useChallengeMode();
  const { userId = '' } = useParams<{ userId: string }>();
  const hubPath = userId ? buildStartPath(userId, enabled) : '/';

  return {
    isChallengeMode: enabled,
    userId,
    hubPath,
    buildLevelPath(levelId: number | string) {
      return `${hubPath}/levels/${levelId}`;
    },
  };
}