// These are copied from the old Apollo implementation

export interface MediaOverviewByLibraryPageData extends MediaOverviewPageData {
  readonly pageData: MediaOverviewPageData['pageData'] & {
    library: { id: string, displayName: string };
  };
}

export interface MediaOverviewPageData {
  readonly loggedInUser: {
    id: string,
    displayName: string,
  },

  readonly pageData: {
    libraries: { id: string, displayName: string }[],
    sharedLibraries: { id: string, displayName: string }[],
    continueWatching: {
      id: string,
      displayName: string,
      subheading: string,
      thumbnailImageUrl: string,
      watchProgress: number
    }[],
    recentlyAdded: {
      id: string,
      displayName: string,
      subheading: string,
      thumbnailImageUrl: string,
      watchProgress: number
    }[],
    everything: {
      id: string,
      displayName: string,
      library: { id: string, displayName: string },
      coverImage: { url: string, width?: number, height?: number },
    }[], // FIXME (infinite scrolling etc.)
  }
}

export interface MediaTitlePageData {
  readonly loggedInUser: {
    id: string,
    displayName: string,
  },

  readonly pageData: {
    mediaTitle: {
      id: string,
      displayName: string,
      library: { id: string, displayName: string },
      synopsis?: string,
      thumbnailImageUrl: string,

      mediaContent: {
        type: string,
        seasons: {
          counter: number,
          episodes: {
            id: string,
            displayName: string,
            durationInSec: number,
            synopsis?: string,
            thumbnailImageUrl: string,
            watchProgressPercentage: number,
          }[],
        }[]
      },
    };

    libraries: { id: string, displayName: string }[];
    sharedLibraries: { id: string, displayName: string }[];
  };
}
