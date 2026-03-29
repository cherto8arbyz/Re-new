import * as ImagePicker from 'expo-image-picker';

export interface PickedImageAsset {
  uri: string;
  width: number;
  height: number;
  fileSize?: number | null;
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}

export interface PickImageAssetOptions {
  source?: 'library' | 'camera';
  allowsMultipleSelection?: boolean;
  includeBase64?: boolean;
  allowsEditing?: boolean;
}

export async function pickImageAssetsAsync(options: PickImageAssetOptions = {}): Promise<PickedImageAsset[]> {
  const {
    source = 'library',
    allowsMultipleSelection = false,
    includeBase64 = true,
    allowsEditing = !allowsMultipleSelection,
  } = options;
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    return [];
  }

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing,
        base64: includeBase64,
        quality: 1,
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing,
        allowsMultipleSelection,
        orderedSelection: allowsMultipleSelection,
        selectionLimit: allowsMultipleSelection ? 0 : 1,
        base64: includeBase64,
        quality: 1,
      });

  if (result.canceled || !result.assets.length) {
    return [];
  }

  return result.assets.map(asset => ({
    uri: asset.uri,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    fileSize: asset.fileSize ?? null,
    base64: asset.base64,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
  }));
}

export async function pickImageAssetAsync(
  source: 'library' | 'camera' = 'library',
  options: Omit<PickImageAssetOptions, 'source' | 'allowsMultipleSelection'> = {},
): Promise<PickedImageAsset | null> {
  const assets = await pickImageAssetsAsync({
    source,
    allowsMultipleSelection: false,
    ...options,
  });
  return assets[0] ?? null;
}
