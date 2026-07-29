import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { getToken, getUser } from '../../utils/auth';

const API_URL = 'https://zedevents-production.up.railway.app';
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/kstg72vx/image/upload';
const CLOUDINARY_AUDIO_URL = 'https://api.cloudinary.com/v1_1/kstg72vx/video/upload';
const UPLOAD_PRESET = 'online_shops_uploads';
const TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0;
const POLL_INTERVAL = 3000;
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

const VENDOR_QUICK_REPLIES = [
  '✅ Still available for that date',
  '💰 Price is negotiable',
  '📅 Fully booked, sorry',
  '📸 I\'ll send more photos',
];

const CUSTOMER_QUICK_REPLIES = [
  '❓ Is this still available?',
  '💰 Can you do a better price?',
  '📦 What\'s included in this package?',
  '📸 Can I see more photos?',
];

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function ChatScreen() {
  const { userId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [iBlockedThem, setIBlockedThem] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [messageActionsId, setMessageActionsId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const scrollRef = useRef<ScrollView>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    getUser().then(setCurrentUser);
    loadOtherUser();
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMessages(true);
      intervalRef.current = setInterval(() => loadMessages(false), POLL_INTERVAL);
      return () => clearInterval(intervalRef.current);
    }, [userId])
  );

  const loadOtherUser = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/auth/user-info/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setOtherUser(data);
    } catch (err) {}
  };

  const loadMessages = async (showSpinner: boolean) => {
    try {
      if (showSpinner) setLoading(true);
      const token = await getToken();
      const response = await fetch(`${API_URL}/messages/conversation/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setMessages(data.messages || []);
      setIBlockedThem(data.i_blocked_them || false);
      setTheyBlockedMe(data.they_blocked_me || false);
    } catch (err) {
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const sendMessagePayload = async (payload: { content?: string; photo_url?: string; audio_url?: string; audio_duration?: number }) => {
    setSending(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ receiver_id: userId, ...payload }),
      });
      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Error', data.error || 'Could not send message.');
        return;
      }

      loadMessages(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (err) {
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!messageText.trim()) return;
    const content = messageText;
    setMessageText('');
    await sendMessagePayload({ content });
  };

  const handleQuickReply = (text: string) => {
    sendMessagePayload({ content: text });
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need access to your photos to send this.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: `chat_${Date.now()}.jpg`,
      } as any);
      formData.append('upload_preset', UPLOAD_PRESET);

      const response = await fetch(CLOUDINARY_URL, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = await response.json();

      if (!data.secure_url) {
        Alert.alert('Upload failed', 'Could not upload the photo. Please try again.');
        return;
      }

      await sendMessagePayload({ photo_url: data.secure_url });
    } catch (err) {
      Alert.alert('Error', 'Could not upload the photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'We need microphone access to record a voice note.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording: newRecording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      Alert.alert('Error', 'Could not start recording.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    clearInterval(recordingTimerRef.current);
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const duration = recordingSeconds;
      setRecording(null);

      if (!uri || duration < 1) return;

      setUploadingAudio(true);
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: `voice_${Date.now()}.m4a` } as any);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('resource_type', 'video');

      const response = await fetch(CLOUDINARY_AUDIO_URL, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = await response.json();

      if (!data.secure_url) {
        Alert.alert('Upload failed', 'Could not upload the voice note. Please try again.');
        return;
      }

      await sendMessagePayload({ audio_url: data.secure_url, audio_duration: duration });
    } catch (err) {
      Alert.alert('Error', 'Could not save the voice note.');
    } finally {
      setUploadingAudio(false);
      setRecordingSeconds(0);
    }
  };

  const cancelRecording = async () => {
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch (err) {}
      setRecording(null);
    }
  };

  const handlePlayAudio = async (messageId: number, audioUrl: string) => {
    try {
      if (playingId === messageId) {
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        setPlayingId(null);
        return;
      }

      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
      soundRef.current = sound;
      setPlayingId(messageId);

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) setPlayingId(null);
      });

      await sound.playAsync();
    } catch (err) {
      Alert.alert('Error', 'Could not play the voice note.');
    }
  };

  const openViewer = (url: string) => {
    setViewerUrl(url);
    setViewerVisible(true);
  };

  const handleDeleteForMe = async (messageId: number) => {
    setMessageActionsId(null);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/messages/${messageId}/delete-for-me`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      Alert.alert('Error', 'Could not delete message.');
    }
  };

  const handleDeleteForEveryone = async (messageId: number) => {
    setMessageActionsId(null);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/messages/${messageId}/delete-for-everyone`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Cannot unsend', data.error || 'Could not unsend this message.');
        return;
      }

      loadMessages(false);
    } catch (err) {
      Alert.alert('Error', 'Could not unsend message.');
    }
  };

  const handleBlockToggle = () => {
    setMenuVisible(false);
    if (iBlockedThem) {
      Alert.alert('Unblock this user?', 'You will be able to message each other again.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            setBlockActionLoading(true);
            try {
              const token = await getToken();
              const response = await fetch(`${API_URL}/messages/block/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!response.ok) {
                Alert.alert('Error', 'Could not unblock this user.');
                return;
              }
              setIBlockedThem(false);
              loadMessages(false);
            } catch (err) {
              Alert.alert('Error', 'Could not connect to the server.');
            } finally {
              setBlockActionLoading(false);
            }
          },
        },
      ]);
    } else {
      Alert.alert('Block this user?', 'They will no longer be able to message you.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setBlockActionLoading(true);
            try {
              const token = await getToken();
              const response = await fetch(`${API_URL}/messages/block/${userId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!response.ok) {
                Alert.alert('Error', 'Could not block this user.');
                return;
              }
              setIBlockedThem(true);
              loadMessages(false);
            } catch (err) {
              Alert.alert('Error', 'Could not connect to the server.');
            } finally {
              setBlockActionLoading(false);
            }
          },
        },
      ]);
    }
  };

  const handleReportUser = () => {
    setMenuVisible(false);
    router.push({ pathname: '/report-user', params: { phone: otherUser?.phone || '' } });
  };

  const handleViewContact = () => {
    setMenuVisible(false);
    if (!otherUser?.phone) return;
    Alert.alert(otherUser.display_name, otherUser.phone, [
      { text: 'Close', style: 'cancel' },
      { text: 'Call', onPress: () => Linking.openURL(`tel:${otherUser.phone}`) },
    ]);
  };

  const isBlocked = iBlockedThem || theyBlockedMe;
  const quickReplies = currentUser?.is_vendor ? VENDOR_QUICK_REPLIES : CUSTOMER_QUICK_REPLIES;
  const isSupportChat = otherUser?.is_admin === true;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={[styles.container, { paddingTop: TOP_INSET }]} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>

          <View style={styles.headerProfileRow}>
            <View style={styles.headerAvatar}>
              {otherUser?.business_photo_url ? (
                <Image source={{ uri: otherUser.business_photo_url }} style={styles.headerAvatarImage} />
              ) : (
                <Text style={styles.headerAvatarText}>
                  {otherUser?.display_name ? otherUser.display_name.charAt(0).toUpperCase() : '?'}
                </Text>
              )}
            </View>
            <Text style={styles.brand} numberOfLines={1}>{otherUser?.display_name || 'Chat'}</Text>
          </View>

          <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)} disabled={blockActionLoading}>
            {blockActionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.menuButtonText}>⋮</Text>
            )}
          </TouchableOpacity>
        </View>

        {theyBlockedMe && (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedBannerText}>This user has blocked you.</Text>
          </View>
        )}
        {iBlockedThem && (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedBannerText}>You have blocked this user.</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#C2410C" />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 ? (
              <Text style={styles.emptyText}>Say hello 👋</Text>
            ) : (
              messages.map((msg: any) => {
                const isMine = currentUser && msg.sender_id === currentUser.id;

                if (msg.deleted_for_everyone) {
                  return (
                    <View
                      key={msg.id}
                      style={[styles.bubbleRow, isMine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}
                    >
                      <View style={[styles.bubble, styles.deletedBubble]}>
                        <Text style={styles.deletedText}>🚫 This message was deleted</Text>
                      </View>
                    </View>
                  );
                }

                return (
                  <View
                    key={msg.id}
                    style={[styles.bubbleRow, isMine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}
                  >
                    {!isMine && (
                      <TouchableOpacity style={styles.dotsBtn} onPress={() => setMessageActionsId(msg.id)}>
                        <Text style={styles.dotsBtnText}>⋮</Text>
                      </TouchableOpacity>
                    )}

                    {msg.photo_url ? (
                      <TouchableOpacity
                        style={[styles.photoBubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
                        onPress={() => openViewer(msg.photo_url)}
                        activeOpacity={0.9}
                      >
                        <Image source={{ uri: msg.photo_url }} style={styles.chatPhoto} resizeMode="cover" />
                      </TouchableOpacity>
                    ) : msg.audio_url ? (
                      <TouchableOpacity
                        style={[styles.audioBubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
                        onPress={() => handlePlayAudio(msg.id, msg.audio_url)}
                      >
                        <Text style={{ fontSize: 18 }}>{playingId === msg.id ? '⏸️' : '▶️'}</Text>
                        <View style={styles.audioWave}>
                          <View style={[styles.audioWaveBar, { backgroundColor: isMine ? '#fff' : '#5C5955' }]} />
                        </View>
                        <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
                          {formatDuration(msg.audio_duration || 0)}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                        <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{msg.content}</Text>
                      </View>
                    )}

                    {isMine && (
                      <TouchableOpacity style={styles.dotsBtn} onPress={() => setMessageActionsId(msg.id)}>
                        <Text style={styles.dotsBtnText}>⋮</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {!isBlocked && (
          <>
            {!isRecording && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.quickReplyRow}
                contentContainerStyle={styles.quickReplyContent}
              >
                {quickReplies.map((reply) => (
                  <TouchableOpacity
                    key={reply}
                    style={styles.quickReplyChip}
                    onPress={() => handleQuickReply(reply)}
                    disabled={sending}
                  >
                    <Text style={styles.quickReplyText}>{reply}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {isRecording ? (
              <View style={[styles.recordingRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>Recording... {formatDuration(recordingSeconds)}</Text>
                <TouchableOpacity style={styles.cancelRecordBtn} onPress={cancelRecording}>
                  <Text style={styles.cancelRecordBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.stopRecordBtn} onPress={stopRecording}>
                  <Text style={styles.stopRecordBtnText}>Send</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto} disabled={uploadingPhoto}>
                  {uploadingPhoto ? (
                    <ActivityIndicator color="#C2410C" size="small" />
                  ) : (
                    <Text style={{ fontSize: 20 }}>📷</Text>
                  )}
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  placeholder="Type a message..."
                  value={messageText}
                  onChangeText={setMessageText}
                  multiline
                />
                {messageText.trim() ? (
                  <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending}>
                    {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendBtnText}>➤</Text>}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.micBtn} onPress={startRecording} disabled={uploadingAudio}>
                    {uploadingAudio ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="mic" size={22} color="#fff" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </SafeAreaView>

      <Modal visible={viewerVisible} transparent={false} animationType="fade">
        <View style={styles.viewerContainer}>
          <TouchableOpacity style={styles.viewerBackButton} onPress={() => setViewerVisible(false)}>
            <Text style={styles.viewerBackButtonText}>←</Text>
          </TouchableOpacity>
          <Image source={{ uri: viewerUrl }} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }} resizeMode="contain" />
        </View>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuBox}>
            {!isSupportChat && (
              <TouchableOpacity style={styles.menuRow} onPress={handleViewContact}>
                <Text style={styles.menuRowText}>📞 View Contact Number</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuRow} onPress={handleReportUser}>
              <Text style={styles.menuRowText}>🚩 Report User</Text>
            </TouchableOpacity>
            {!isSupportChat && (
              <TouchableOpacity style={styles.menuRow} onPress={handleBlockToggle}>
                <Text style={[styles.menuRowText, { color: '#DC2626' }]}>
                  {iBlockedThem ? '✅ Unblock User' : '🚫 Block User'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuCancelBtn} onPress={() => setMenuVisible(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={messageActionsId !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMessageActionsId(null)}>
          <View style={styles.menuBox}>
            {(() => {
              const msg = messages.find((m) => m.id === messageActionsId);
              const isMine = currentUser && msg?.sender_id === currentUser.id;
              const canUnsend = isMine && msg && !msg.read_at;
              return (
                <>
                  {canUnsend && (
                    <TouchableOpacity style={styles.menuRow} onPress={() => handleDeleteForEveryone(messageActionsId!)}>
                      <Text style={[styles.menuRowText, { color: '#DC2626' }]}>🗑️ Delete for Everyone</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.menuRow} onPress={() => handleDeleteForMe(messageActionsId!)}>
                    <Text style={styles.menuRowText}>🗑️ Delete for Me</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
            <TouchableOpacity style={styles.menuCancelBtn} onPress={() => setMessageActionsId(null)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F1EC' },
  topBar: {
    backgroundColor: '#C2410C',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  backButtonText: { color: '#fff', fontSize: 18 },
  headerProfileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#EA580C',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImage: { width: '100%', height: '100%' },
  headerAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  brand: { color: '#FFF3E8', fontSize: 15, fontWeight: '700', flex: 1 },
  menuButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  menuButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  blockedBanner: { backgroundColor: '#DC2626', padding: 8 },
  blockedBannerText: { color: '#fff', fontSize: 11, textAlign: 'center', fontWeight: '600' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: '#5C5955', marginTop: 40 },
  messagesList: { padding: 14, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-end', gap: 2 },
  dotsBtn: { padding: 6 },
  dotsBtnText: { fontSize: 16, color: '#5C5955', fontWeight: '700' },
  bubble: { maxWidth: '75%', padding: 12, borderRadius: 16 },
  bubbleMine: { backgroundColor: '#C2410C', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E0DC', borderBottomLeftRadius: 4 },
  bubbleTextMine: { color: '#fff', fontSize: 14 },
  bubbleTextTheirs: { color: '#211D1A', fontSize: 14 },
  deletedBubble: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#E2E0DC', borderStyle: 'dashed' },
  deletedText: { color: '#5C5955', fontSize: 12, fontStyle: 'italic' },
  photoBubble: { maxWidth: '65%', borderRadius: 16, overflow: 'hidden', padding: 3 },
  chatPhoto: { width: 180, height: 180, borderRadius: 12, backgroundColor: '#FBEAD9' },
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    minWidth: 150,
  },
  audioWave: { flex: 1, height: 3, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 2, overflow: 'hidden' },
  audioWaveBar: { width: '100%', height: '100%' },
  quickReplyRow: { flexGrow: 0, backgroundColor: '#F4F1EC' },
  quickReplyContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 8 },
  quickReplyChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E0DC',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickReplyText: { fontSize: 12, color: '#211D1A', fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
    backgroundColor: '#F4F1EC',
    borderTopWidth: 1,
    borderTopColor: '#E2E0DC',
    alignItems: 'flex-end',
  },
  photoBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E0DC',
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E0DC',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#EA580C',
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 18 },
  micBtn: {
    backgroundColor: '#2563EB',
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: '#F4F1EC',
    borderTopWidth: 1,
    borderTopColor: '#E2E0DC',
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#DC2626' },
  recordingText: { flex: 1, fontSize: 13, color: '#211D1A', fontWeight: '600' },
  cancelRecordBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E0DC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  cancelRecordBtnText: { color: '#5C5955', fontSize: 12, fontWeight: '600' },
  stopRecordBtn: { backgroundColor: '#EA580C', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  stopRecordBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  viewerContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerBackButton: {
    position: 'absolute',
    top: 40,
    left: 18,
    zIndex: 10,
    backgroundColor: '#C2410C',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBackButtonText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuBox: { backgroundColor: '#F4F1EC', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  menuRow: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E0DC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  menuRowText: { fontSize: 15, fontWeight: '600', color: '#211D1A' },
  menuCancelBtn: { padding: 14, alignItems: 'center', marginTop: 4 },
  menuCancelText: { color: '#5C5955', fontWeight: '600', fontSize: 15 },
});
