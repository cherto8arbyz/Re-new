import type { ImageSourcePropType } from 'react-native';

import type { WardrobeStorageMode } from './types';

export const wardrobeAssets = {
  textures: {
    wood1: require('../../../../assets/wardrobe/textures/wood_1.jpg'),
    wood2: require('../../../../assets/wardrobe/textures/wood_2.jpg'),
    wood3: require('../../../../assets/wardrobe/textures/wood_3.jpg'),
    wood4: require('../../../../assets/wardrobe/textures/wood_4.jpg'),
    metal1: require('../../../../assets/wardrobe/textures/metal_1.jpg'),
    metal2: require('../../../../assets/wardrobe/textures/metal_2.jpg'),
    metal3: require('../../../../assets/wardrobe/textures/metal_3.jpg'),
  },
  gradients: {
    dusk1: require('../../../../assets/wardrobe/gradients/gradient_1.jpg'),
    dusk2: require('../../../../assets/wardrobe/gradients/gradient_2.jpg'),
  },
  shadows: {
    shadow1: require('../../../../assets/wardrobe/shadows/shadow_1.jpg'),
    shadow2: require('../../../../assets/wardrobe/shadows/shadow_2.jpg'),
    shadow3: require('../../../../assets/wardrobe/shadows/shadow_3.jpg'),
    shadow4: require('../../../../assets/wardrobe/shadows/shadow_4.jpg'),
  },
  rails: {
    rail1: require('../../../../assets/wardrobe/rails/rail_1.png'),
    rail2: require('../../../../assets/wardrobe/rails/rail_2.png'),
  },
  hangers: {
    hanger1: require('../../../../assets/wardrobe/hangers/hanger_1.png'),
    hanger2: require('../../../../assets/wardrobe/hangers/hanger_2.png'),
  },
} as const;

export interface WardrobeSceneAssetBundle {
  gradient: ImageSourcePropType;
  texture: ImageSourcePropType;
  shadow: ImageSourcePropType;
  rail: ImageSourcePropType;
  hanger: ImageSourcePropType;
  tint: string;
  textureOpacity: number;
  shadowOpacity: number;
}

export function resolveWardrobeSceneAssets(storageMode: WardrobeStorageMode): WardrobeSceneAssetBundle {
  switch (storageMode) {
    case 'folded':
      return {
        gradient: wardrobeAssets.gradients.dusk2,
        texture: wardrobeAssets.textures.wood2,
        shadow: wardrobeAssets.shadows.shadow2,
        rail: wardrobeAssets.rails.rail1,
        hanger: wardrobeAssets.hangers.hanger1,
        tint: 'rgba(10, 8, 10, 0.58)',
        textureOpacity: 0.34,
        shadowOpacity: 0.46,
      };
    case 'drawer':
      return {
        gradient: wardrobeAssets.gradients.dusk2,
        texture: wardrobeAssets.textures.wood4,
        shadow: wardrobeAssets.shadows.shadow3,
        rail: wardrobeAssets.rails.rail1,
        hanger: wardrobeAssets.hangers.hanger2,
        tint: 'rgba(12, 9, 18, 0.62)',
        textureOpacity: 0.3,
        shadowOpacity: 0.5,
      };
    case 'shoe-shelf':
      return {
        gradient: wardrobeAssets.gradients.dusk2,
        texture: wardrobeAssets.textures.wood3,
        shadow: wardrobeAssets.shadows.shadow2,
        rail: wardrobeAssets.rails.rail2,
        hanger: wardrobeAssets.hangers.hanger2,
        tint: 'rgba(12, 11, 13, 0.6)',
        textureOpacity: 0.32,
        shadowOpacity: 0.44,
      };
    case 'headwear-rail':
      return {
        gradient: wardrobeAssets.gradients.dusk1,
        texture: wardrobeAssets.textures.metal1,
        shadow: wardrobeAssets.shadows.shadow4,
        rail: wardrobeAssets.rails.rail2,
        hanger: wardrobeAssets.hangers.hanger2,
        tint: 'rgba(8, 10, 18, 0.58)',
        textureOpacity: 0.24,
        shadowOpacity: 0.5,
      };
    case 'accessory-hooks':
      return {
        gradient: wardrobeAssets.gradients.dusk1,
        texture: wardrobeAssets.textures.metal3,
        shadow: wardrobeAssets.shadows.shadow3,
        rail: wardrobeAssets.rails.rail2,
        hanger: wardrobeAssets.hangers.hanger2,
        tint: 'rgba(8, 9, 17, 0.56)',
        textureOpacity: 0.26,
        shadowOpacity: 0.46,
      };
    case 'overview':
      return {
        gradient: wardrobeAssets.gradients.dusk1,
        texture: wardrobeAssets.textures.wood1,
        shadow: wardrobeAssets.shadows.shadow4,
        rail: wardrobeAssets.rails.rail1,
        hanger: wardrobeAssets.hangers.hanger1,
        tint: 'rgba(10, 9, 13, 0.54)',
        textureOpacity: 0.22,
        shadowOpacity: 0.42,
      };
    case 'hanger':
    default:
      return {
        gradient: wardrobeAssets.gradients.dusk1,
        texture: wardrobeAssets.textures.wood1,
        shadow: wardrobeAssets.shadows.shadow4,
        rail: wardrobeAssets.rails.rail1,
        hanger: wardrobeAssets.hangers.hanger1,
        tint: 'rgba(9, 8, 14, 0.5)',
        textureOpacity: 0.24,
        shadowOpacity: 0.52,
      };
  }
}
