export type FullUserProfile = {
  user: {
    id: string,
    name: string,
    createdAt: Date,
  },

  linkedAccounts: {
    providerType: string,
    providerUserId: string,
    providerUserDisplayName: string,
    profilePictureDataUrl: string | null,
    createdAt: Date,
  }[],
  availableAccountProviders: string[],

  session: {
    current: string,
    all: {
      id: string,
      createdAt: Date,
      expiresAt: Date,
      userAgent: string | null,
    }[],
  },
}

export type BackendConfig = {
  appBaseUrl: string,
  internalBackendBaseUrl: string,

  auth: {
    providers: { identifier: string, displayName: string }[],
  },
}

export type VirtualFileSystemFileList = {
  files: {
    name: string,
    isDirectory: boolean,
    path: string,
  }[],
}
