export type MainTabParamList = {
  Dashboard: undefined;
  Library: undefined;
  Reports: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  Scanner: { cardId?: string } | undefined;
  Review: { cardId: string };
  CardDetail: { cardId: string };
  Events: undefined;
  Categories: undefined;
  StorageSettings: undefined;
  BackupRestore: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
