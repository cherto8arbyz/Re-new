export type WardrobeSectionKey =
  | 'all'
  | 'tops'
  | 'knitwear'
  | 'outerwear'
  | 'bottoms'
  | 'dresses'
  | 'socks'
  | 'shoes'
  | 'headwear'
  | 'accessories';

export type WardrobeStorageMode =
  | 'overview'
  | 'hanger'
  | 'folded'
  | 'drawer'
  | 'shoe-shelf'
  | 'headwear-rail'
  | 'accessory-hooks';

export interface WardrobeSectionEntry {
  key: WardrobeSectionKey;
  label: string;
  sceneTitle: string;
  description: string;
  storageMode: WardrobeStorageMode;
  count: number;
}
