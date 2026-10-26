import * as Sharing from 'expo-sharing';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ZIP_MIME = 'application/zip';

export async function shareFile(uri: string, kind: 'xlsx' | 'zip' = 'xlsx'): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: kind === 'xlsx' ? XLSX_MIME : ZIP_MIME,
    dialogTitle: kind === 'xlsx' ? 'Share report' : 'Share backup',
  });
}
