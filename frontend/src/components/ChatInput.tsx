import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, message as antMessage, Typography } from 'antd';
import {
    SendOutlined,
    AudioOutlined,
    DeleteOutlined,
    PauseCircleOutlined,
    PaperClipOutlined,
} from '@ant-design/icons';
import { formatDuration } from '../utils/chatUtils';

const { TextArea } = Input;
const { Text } = Typography;

interface ChatInputProps {
    onSendText: (text: string) => Promise<void> | void;
    onSendVoice: (voice: Blob, duration: number) => Promise<void> | void;
    sending: boolean;
    onTyping?: () => void;
    onSendFile?: (file: File) => Promise<void> | void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendText, onSendVoice, sending, onTyping, onSendFile }) => {
    const [messageInput, setMessageInput] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // File/Image Preview State
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
            if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        }
    }, [audioPreviewUrl, previewUrl]);

    // --- Voice Logic ---
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

    // --- File & Paste Logic ---
    const handleFileSelect = (file: File) => {
        // Clear previous
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSelectedFile(file);

        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }

        // Reset file input so same file can be selected again if cancelled
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) handleFileSelect(file);
                break;
            }
        }
    };

    const clearFile = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setSelectedFile(null);
    };

    // --- Sending Logic ---
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

    const handleSendFileAction = async () => {
        if (!selectedFile || !onSendFile || sending) return;
        try {
            await onSendFile(selectedFile);
            clearFile();
        } catch (error) {
            console.error('Failed to send file:', error);
            antMessage.error('Ошибка отправки файла');
        }
    };

    // --- Render ---
    return (
        <div style={{
            background: '#fff',
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* File Preview Area */}
            {selectedFile && (
                <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: '#fafafa'
                }}>
                    {previewUrl ? (
                        <img
                            src={previewUrl}
                            alt="Preview"
                            style={{ height: 60, borderRadius: 8, objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{
                            height: 60,
                            width: 60,
                            borderRadius: 8,
                            background: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 24
                        }}>
                            📎
                        </div>
                    )}
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedFile.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                            {(selectedFile.size / 1024).toFixed(1)} KB
                        </div>
                    </div>
                    <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={clearFile}
                    />
                </div>
            )}

            {/* Input Area */}
            <div style={{
                padding: '12px 16px',
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
                            placeholder={selectedFile ? "Добавить описание..." : "Нашите сообщение..."} // TODO: description support later
                            value={messageInput}
                            onChange={(e) => {
                                setMessageInput(e.target.value);
                                if (onTyping) onTyping();
                            }}
                            onPaste={handlePaste}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (selectedFile) {
                                        handleSendFileAction(); // Ideally send with caption if backend supports
                                    } else {
                                        handleSendText();
                                    }
                                }
                            }}
                            style={{ borderRadius: 12, resize: 'none', flex: 1 }}
                        />

                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />

                        {onSendFile && !selectedFile && (
                            <Button
                                icon={<PaperClipOutlined />}
                                shape="circle"
                                size="large"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={sending}
                            />
                        )}

                        {!messageInput.trim() && !selectedFile && (
                            <Button
                                icon={<AudioOutlined />}
                                shape="circle"
                                size="large"
                                onClick={startRecording}
                                disabled={sending}
                            />
                        )}

                        {(!!messageInput.trim() || !!selectedFile) && (
                            <Button
                                type="primary"
                                shape="circle"
                                size="large"
                                icon={<SendOutlined />}
                                onClick={selectedFile ? handleSendFileAction : handleSendText}
                                loading={sending}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

