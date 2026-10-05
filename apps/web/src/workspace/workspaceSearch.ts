import { createContext, useContext } from 'react';

export const WorkspaceSearchContext = createContext<(() => void) | null>(null);

/** Opens the shell's ⌘K palette; null outside a WorkspaceFrame. */
export const useOpenWorkspaceSearch = () => useContext(WorkspaceSearchContext);
