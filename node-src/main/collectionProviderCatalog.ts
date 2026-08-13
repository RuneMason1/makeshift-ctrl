import { MakeShiftPort } from '@eos-makeshift/serial'

import { GameLauncher } from './gameLauncher'

export type CollectionProviderContext = {
  getPort: () => MakeShiftPort | undefined
}

export type CollectionProviderDefinition = {
  id: string
  create: (context: CollectionProviderContext) => GameLauncher
}

// Public builds register reusable providers here. Ctrl startup consumes this
// catalog generically and does not need provider-specific imports or routing.
export const collectionProviderCatalog: readonly CollectionProviderDefinition[] = [
  { id: 'steam', create: context => new GameLauncher(context.getPort) },
]
