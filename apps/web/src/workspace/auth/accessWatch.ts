type Listener = () => void;

const listeners = new Set<Listener>();

/** Lets the shell re-check the session when the API still refuses a request after the client's token-refresh retry. */
export const onAccessDenied = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const reportAccessDenied = (): void => {
  for (const listener of listeners) listener();
};
