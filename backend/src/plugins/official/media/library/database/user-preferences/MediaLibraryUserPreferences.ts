export default class MediaLibraryUserPreferences {
  /** @internal */
  private static readonly REGISTRY = {
    HIDE_FROM_OVERVIEW: {
      id: 1,
      parse: (value: string | undefined): boolean => value === '1', // default false
      stringify: (value: boolean): string => value ? '1' : '0',
    },
    HIDE_FROM_SIDEBAR: {
      id: 2,
      parse: (value: string | undefined): boolean => value === '1', // default false
      stringify: (value: boolean): string => value ? '1' : '0',
    },
  } as const;

  /**
   * @internal
   */
  constructor(
    public readonly hideFromOverview: boolean,
    public readonly hideFromSidebar: boolean,
  ) {
  }

  /**
   * @internal
   */
  public static fromData(data: {
    preferenceId: number,
    value: string,
  }[]): MediaLibraryUserPreferences {
    const hideFromOverviewValue = data.find(p => p.preferenceId === this.REGISTRY.HIDE_FROM_OVERVIEW.id)?.value;
    const hideFromSidebarValue = data.find(p => p.preferenceId === this.REGISTRY.HIDE_FROM_SIDEBAR.id)?.value;

    return new MediaLibraryUserPreferences(
      this.REGISTRY.HIDE_FROM_OVERVIEW.parse(hideFromOverviewValue),
      this.REGISTRY.HIDE_FROM_SIDEBAR.parse(hideFromSidebarValue),
    );
  }

  /**
   * @internal
   */
  public static getHideFromOverviewPreferenceData(value: boolean): { preferenceId: number, value: string } {
    return {
      preferenceId: this.REGISTRY.HIDE_FROM_OVERVIEW.id,
      value: this.REGISTRY.HIDE_FROM_OVERVIEW.stringify(value),
    };
  }

  /**
   * @internal
   */
  public static getHideFromSidebarPreferenceData(value: boolean): { preferenceId: number, value: string } {
    return {
      preferenceId: this.REGISTRY.HIDE_FROM_SIDEBAR.id,
      value: this.REGISTRY.HIDE_FROM_SIDEBAR.stringify(value),
    };
  }

  /**
   * @internal
   */
  public static toData(preferences: MediaLibraryUserPreferences): { preferenceId: number, value: string }[] {
    return [
      {
        preferenceId: this.REGISTRY.HIDE_FROM_OVERVIEW.id,
        value: this.REGISTRY.HIDE_FROM_OVERVIEW.stringify(preferences.hideFromOverview),
      },
      {
        preferenceId: this.REGISTRY.HIDE_FROM_SIDEBAR.id,
        value: this.REGISTRY.HIDE_FROM_SIDEBAR.stringify(preferences.hideFromSidebar),
      },
    ];
  }
}
