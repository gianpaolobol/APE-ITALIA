/** Native capture adapters (camera, gallery, documents). Verified only by typecheck/bundle, not on devices. */
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { PickedFile } from './evidence';

export class PermissionDeniedError extends Error {}

function fromAsset(a: { uri: string; fileName?: string | null; mimeType?: string; fileSize?: number }, fallbackName: string): PickedFile {
 const mimeType = a.mimeType ?? (a.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
 return { uri: a.uri, name: a.fileName ?? fallbackName, mimeType, ...(a.fileSize !== undefined ? { size: a.fileSize } : {}) };
}
const imageOptions: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85, exif: false, allowsMultipleSelection: false };

export async function takePhoto(): Promise<PickedFile | null> {
 const perm = await ImagePicker.requestCameraPermissionsAsync();
 if (!perm.granted) throw new PermissionDeniedError('Permesso fotocamera negato');
 const r = await ImagePicker.launchCameraAsync(imageOptions);
 return r.canceled || !r.assets[0] ? null : fromAsset(r.assets[0], 'foto.jpg');
}

export async function pickImage(): Promise<PickedFile | null> {
 const r = await ImagePicker.launchImageLibraryAsync(imageOptions);
 return r.canceled || !r.assets[0] ? null : fromAsset(r.assets[0], 'immagine.jpg');
}

export async function pickDocument(): Promise<PickedFile | null> {
 const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'], copyToCacheDirectory: true, multiple: false });
 if (r.canceled || !r.assets[0]) return null;
 const a = r.assets[0];
 return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', ...(a.size !== undefined ? { size: a.size } : {}) };
}

export type PickedVideo = PickedFile & { durationSec: number };

const videoOptions = (maxSec: number): ImagePicker.ImagePickerOptions => ({
 mediaTypes: ['videos'], videoMaxDuration: Math.max(5, Math.round(maxSec)), allowsEditing: false, exif: false,
 videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720,
 videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
});

function fromVideo(a: ImagePicker.ImagePickerAsset): PickedVideo {
 const mimeType = a.mimeType ?? (a.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
 return { uri: a.uri, name: a.fileName ?? 'video.mp4', mimeType, ...(a.fileSize !== undefined ? { size: a.fileSize } : {}), durationSec: Math.round((a.duration ?? 0) / 1000) };
}

/** Records a walkthrough; iOS stops the recording automatically at maxSec. */
export async function recordVideo(maxSec: number): Promise<PickedVideo | null> {
 const perm = await ImagePicker.requestCameraPermissionsAsync();
 if (!perm.granted) throw new PermissionDeniedError('Permesso fotocamera negato');
 const r = await ImagePicker.launchCameraAsync(videoOptions(maxSec));
 return r.canceled || !r.assets[0] ? null : fromVideo(r.assets[0]);
}

export async function pickVideo(maxSec: number): Promise<PickedVideo | null> {
 const r = await ImagePicker.launchImageLibraryAsync(videoOptions(maxSec));
 return r.canceled || !r.assets[0] ? null : fromVideo(r.assets[0]);
}
