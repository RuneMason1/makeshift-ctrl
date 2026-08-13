import { MakeShiftPort } from '@eos-makeshift/serial';
import { GameLauncher } from './gameLauncher';
export type CollectionProviderContext = {
    getPort: () => MakeShiftPort | undefined;
};
export type CollectionProviderDefinition = {
    id: string;
    create: (context: CollectionProviderContext) => GameLauncher;
};
export declare const collectionProviderCatalog: readonly CollectionProviderDefinition[];
