declare module '@art/artwork-data' {
  export type ArtworkFilter = import('./browser').ArtworkFilter;
  export const exploreArtworkRows: ReturnType<typeof import('./browser').createArtworkExplorer>;
}
