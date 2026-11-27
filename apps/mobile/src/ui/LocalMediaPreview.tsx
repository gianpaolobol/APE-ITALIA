import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Modal, Pressable, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { createPreviewLifetime } from '../survey/preview-lifetime';
import type { PhotoRef } from '../survey/questions';

export type MediaReader = (qid: string, photo: PhotoRef, use: (uri: string) => Promise<void>) => Promise<void>;
/** Explicit user-initiated handoff; recipient apps may copy the PDF. */
export async function shareSurveyPdf(read: MediaReader, qid: string, photo: PhotoRef): Promise<void> {
 try { await read(qid, photo, uri => Sharing.shareAsync(uri, { mimeType: 'application/pdf' })); }
 catch { Alert.alert('Documento non disponibile'); }
}
/** Native decoder release and caches require physical QA. */
export function LocalMediaPreview({ qid, photo, read, onClose }: {
 qid: string; photo: PhotoRef; read: MediaReader; onClose: () => void;
}) {
 const [uri, setUri] = useState<string | null>(null);
 const insets = useSafeAreaInsets();
 const refs = useRef({ read, onClose, photo });
 refs.current = { read, onClose, photo };
 useEffect(() => {
  const life = createPreviewLifetime();
  let mounted = true;
  const close = () => { if (mounted) refs.current.onClose(); };
  const sub = AppState.addEventListener('change', state => { if (state !== 'active') close(); });
  void refs.current.read(qid, refs.current.photo, path => life.hold(path, setUri))
   .catch(() => { if (mounted && !life.stopped) { Alert.alert('Allegato non disponibile'); close(); } });
  if (AppState.currentState && AppState.currentState !== 'active') close();
  return () => { mounted = false; sub.remove(); life.close(); };
 }, [qid, photo.uri]);
 return <Modal visible animationType="none" onRequestClose={onClose}>
  <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top, paddingBottom: insets.bottom }}>
   <Pressable accessibilityRole="button" accessibilityLabel="Chiudi anteprima" onPress={onClose}
    style={{ padding: 16, alignSelf: 'flex-end' }}><Text style={{ color: '#fff', fontSize: 18 }}>Chiudi</Text></Pressable>
   {!uri ? <ActivityIndicator color="#fff" style={{ flex: 1 }} /> : photo.mimeType.startsWith('video/')
    ? <LocalVideo uri={uri} /> : <Image source={{ uri }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />}
  </View>
 </Modal>;
}
function LocalVideo({ uri }: { uri: string }) {
 const player = useVideoPlayer(uri, p => { p.muted = true; p.play(); });
 return <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" />;
}
