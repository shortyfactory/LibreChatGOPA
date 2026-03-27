import React, { useState } from 'react';
import type { TError } from 'librechat-data-provider';

type ProviderValue = {
  error: TError | null;
  setError: React.Dispatch<React.SetStateAction<TError | null>>;
};
const ApiErrorBoundaryContext = React.createContext<ProviderValue | undefined>(undefined);

export const ApiErrorBoundaryProvider = ({
  value,
  children,
}: {
  value?: ProviderValue;
  children: React.ReactNode;
}) => {
  const [error, setError] = useState<TError | null>(null);
  return (
    <ApiErrorBoundaryContext.Provider value={value ?? { error, setError }}>
      {children}
    </ApiErrorBoundaryContext.Provider>
  );
};

export const useApiErrorBoundary = () => {
  const context = React.useContext(ApiErrorBoundaryContext);

  if (context === undefined) {
    throw new Error('useApiErrorBoundary must be used inside ApiErrorBoundaryProvider');
  }

  return context;
};
