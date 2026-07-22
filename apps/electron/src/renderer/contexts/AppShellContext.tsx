import * as React from 'react'

export interface AppShellContextType {
  // Placeholder - context values will be added as needed
}

const AppShellContext = React.createContext<AppShellContextType | undefined>(undefined)

export function AppShellProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: AppShellContextType
}): React.ReactElement {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

export function useAppShellContext(): AppShellContextType {
  const context = React.useContext(AppShellContext)
  if (context === undefined) {
    throw new Error('useAppShellContext must be used within AppShellProvider')
  }
  return context
}
