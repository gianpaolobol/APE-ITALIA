/** Native adapters (expo-file-system / expo-sharing). Verified by typecheck and bundle only. */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { DownloadPort, SharePort } from './certificate-download';

export const nativeDownload: DownloadPort = async (url, fileName, headers) => {
 const file = await File.downloadFileAsync(url, new File(Paths.cache, fileName), { headers, idempotent: true });
 return { uri: file.uri };
};

export const nativeShare: SharePort = {
 available: () => Sharing.isAvailableAsync(),
 share: uri => Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Attestato di prestazione energetica' }),
};
