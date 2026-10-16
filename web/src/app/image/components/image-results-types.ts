export type ImageLightboxItem = {
  id: string;
  src: string;
  downloadName?: string;
  sizeLabel?: string;
  dimensions?: string;
};

export type DownloadableImage = {
  id: string;
  selectionKey: string;
  src: string;
  path?: string;
  fileName: string;
  imageIndex: number;
};
