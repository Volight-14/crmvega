import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, message as antMessage, Typography } from 'antd';
import {
    SendOutlined,
    AudioOutlined,
    DeleteOutlined,
    PauseCircleOutlined,
} from '@ant-design/icons';
import { formatDuration } from '../utils/chatUtils';

const { TextArea } = Input;
const { Text } = Typography;

interface ChatInputProps {
    onSendText: (text: string) => Promise<void> | void;
    onSendVoice: (voice: Blob, duration: number) => Promise<void> | void;
    sending: boolean;
    onTyping?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendText, onSendVoice, sending, onTyping }) => {
    const [messageInput, setMessageInput] = useState('');

    // Voice Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (audioPreviewUrl) {
                URL.revokeObjectURL(audioPreviewUrl);
            }
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        }
    }, [audioPreviewUrl]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Detect support
            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/mp4';
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
            }
            const options = mimeType ? { mimeType } : undefined;

            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const type = mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunksRef.current, { type });
                const url = URL.createObjectURL(audioBlob);
                setRecordedAudio(audioBlob);
                setAudioPreviewUrl(url);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingDuration(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

        } catch (error) {
            antMessage.error('Не удалось получить доступ к микрофону');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    };

    const cancelRecording = () => {
        setRecordedAudio(null);
        setAudioPreviewUrl(null);
        setRecordingDuration(0);
        setIsRecording(false);
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
    };

    const handleSendText = async () => {
        if (!messageInput.trim() || sending) return;
        try {
            await onSendText(messageInput);
            setMessageInput('');
        } catch (e) {
            console.error('Failed to send text:', e);
        }
    };

    const handleSendVoice = async () => {
        if (!recordedAudio || sending) return;
        try {
            await onSendVoice(recordedAudio, recordingDuration);
            cancelRecording();
        } catch (e) {
            console.error('Failed to send voice:', e);
        }
    };

    return (
        <div style={{
            padding: '12px 16px',
            background: '#fff',
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 64,
        }}>
            {recordedAudio && audioPreviewUrl ? (
                <>
                    <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={cancelRecording}
                        shape="circle"
                    />
                    <div style={{
                        flex: 1,
                        background: '#f5f5f5',
                        borderRadius: 20,
                        padding: '4px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12
                    }}>
                        <audio src={audioPreviewUrl} controls style={{ height: 32, width: '100%' }} />
                    </div>
                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={handleSendVoice}
                        loading={sending}
                        shape="circle"
                    />
                </>
            ) : isRecording ? (
                <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 12, padding: '0 8px' }}>
                    <div style={{
                        color: '#ff4d4f',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <div style={{ width: 10, height: 10, background: '#ff4d4f', borderRadius: '50%' }} />
                        {formatDuration(recordingDuration)}
                    </div>
                    <Text type="secondary" style={{ flex: 1, marginLeft: 16 }}>Запись голосового сообщения...</Text>
                    <Button
                        danger
                        type="primary"
                        icon={<PauseCircleOutlined />}
                        onClick={stopRecording}
                        shape="circle"
                    />
                </div>
            ) : (
                <>
                    <TextArea
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        placeholder="Напишите сообщение..."
                        value={messageInput}
                        onChange={(e) => {
                            setMessageInput(e.target.value);
                            if (onTyping) onTyping();
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendText();
                            }
                        }}
                        style={{ borderRadius: 12, resize: 'none', flex: 1 }}
                    />

                    <Button
                        icon={<AudioOutlined />}
                        shape="circle"
                        size="large"
                        onClick={startRecording}
                        disabled={sending || !!messageInput.trim()}
                    />

                    <Button
                        type="primary"
                        shape="circle"
                        size="large"
                        icon={<SendOutlined />}
                        onClick={handleSendText}
                        loading={sending}
                        disabled={!messageInput.trim() && !sending}
                    />
                </>
            )}
        </div>
    );
};

