export type FullUserProfile = {
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
  };

  linkedAccounts: {
    id: string;
    providerId: string;
    accountId: string;
    createdAt: Date;
  }[];
  availableAccountProviders: string[];
  appBaseUrl: BackendConfig['appBaseUrl'];

  session: {
    current: string;
    all: {
      id: string;
      token: string;
      createdAt: Date;
      expiresAt: Date;
      userAgent: string | null;
      ipAddress: string | null;
    }[];
  };
}

export type BackendConfig = {
  appBaseUrl: string;
  internalBackendBaseUrl: string;

  auth: {
    providers: string[];
  }
}

export type VirtualFileSystemFileList = {
  files: {
    name: string;
    isDirectory: boolean;
    path: string;
  }[];
}
