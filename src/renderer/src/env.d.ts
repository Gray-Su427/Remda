/// <reference types="vite/client" />

import type { RemdaApi } from '@shared/api'

declare global {
  interface Window {
    remda: RemdaApi
  }
}

export {}
