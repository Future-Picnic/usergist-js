'use client'
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { UserGist, type UserGistClient } from '@usergist/feedback-web'
const Context = createContext<UserGistClient>(UserGist)
/** The host owns activation. Mount/unmount never identifies or logs out users. */
export function UserGistProvider({
  client = UserGist,
  children,
}: {
  client?: UserGistClient
  children: ReactNode
}) {
  return <Context.Provider value={client}>{children}</Context.Provider>
}
export function useUserGist() {
  return useContext(Context)
}
export function useUserGistState() {
  const client = useUserGist()
  return useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot
  )
}
