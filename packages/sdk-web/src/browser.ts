import { UserGist } from './client.js'
if (typeof window !== 'undefined')
  Object.defineProperty(window, 'UserGist', {
    value: UserGist,
    configurable: true,
  })
export { UserGist }
export { createUserGist, UserGistClient } from './client.js'
