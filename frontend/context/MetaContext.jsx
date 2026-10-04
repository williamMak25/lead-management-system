'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';

const MetaContext = createContext(null);

const EMPTY = {
  stages: [],
  tags: [],
  lostReasons: [],
  teams: [],
  users: [],
  utm: { source: [], medium: [], campaign: [] },
  activityTypes: [],
  scoringFields: [],
};

// Stages, tags, users, teams… — the lookup lists every screen's dropdowns need, loaded once.
export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(
    () =>
      api.meta().then((m) => {
        setMeta(m);
        setLoaded(true);
      }),
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <MetaContext.Provider value={{ ...meta, loaded, refresh }}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  return useContext(MetaContext);
}
