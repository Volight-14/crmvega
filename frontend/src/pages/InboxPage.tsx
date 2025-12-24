import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { contactsAPI, contactMessagesAPI } from '../services/api';
import { InboxContact, Message } from '../types';
import { Link, useSearchParams } from 'react-router-dom';

interface ExtendedInboxContact extends InboxContact {
    telegram_user_id?: number | string;
}

const InboxPage: React.FC = () => {
    const { manager } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [contacts, setContacts] = useState<ExtendedInboxContact[]>([]);
    const [selectedContact, setSelectedContact] = useState<ExtendedInboxContact | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [messageInput, setMessageInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // URL params handling
    const contactIdParam = searchParams.get('contactId');

    useEffect(() => {
        fetchContacts();
        const interval = setInterval(fetchContacts, 10000); // Poll for updates every 10s
        return () => clearInterval(interval);
    }, [searchQuery]);

    useEffect(() => {
        if (contactIdParam && contacts.length > 0) {
            const contact = contacts.find(c => c.id === Number(contactIdParam));
            if (contact) {
                selectContact(contact);
            }
        }
    }, [contactIdParam, contacts]);

    const fetchContacts = async () => {
        try {
            if (contacts.length === 0) setIsLoadingContacts(true);
            const data = await contactsAPI.getSummary({ search: searchQuery });
            setContacts(data as ExtendedInboxContact[]);
        } catch (error) {
            console.error('Error fetching inbox contacts:', error);
        } finally {
            setIsLoadingContacts(false);
        }
    };

    const fetchMessages = async (contactId: number) => {
        try {
            setIsLoadingMessages(true);
            const data = await contactMessagesAPI.getByContactId(contactId, { limit: 50 });
            setMessages(data.reverse()); // Show newest at bottom
            scrollToBottom();
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            setIsLoadingMessages(false);
        }
    };

    const selectContact = (contact: ExtendedInboxContact) => {
        setSelectedContact(contact);
        setSearchParams({ contactId: String(contact.id) });
        fetchMessages(contact.id);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedContact || !messageInput.trim()) return;

        try {
            const newMessage = await contactMessagesAPI.sendToContact(selectedContact.id, messageInput, 'manager');
            setMessages([...messages, newMessage]);
            setMessageInput('');
            fetchContacts(); // Update last message in sidebar
            scrollToBottom();
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message');
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    return (
        <div className="flex h-[calc(100vh-2rem)] bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200 mt-4 mx-4">
            {/* Sidebar - Contact List */}
            <div className="w-1/3 border-r border-slate-200 flex flex-col bg-slate-50">
                <div className="p-4 border-b border-slate-200 bg-white">
                    <h2 className="text-xl font-bold text-slate-800 mb-4">Диалоги</h2>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Поиск..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {isLoadingContacts && contacts.length === 0 ? (
                        <div className="p-4 text-center text-slate-500">Загрузка...</div>
                    ) : (
                        contacts.map((contact) => (
                            <div
                                key={contact.id}
                                onClick={() => selectContact(contact)}
                                className={`p-4 cursor-pointer hover:bg-slate-100 transition-colors border-b border-slate-100 ${selectedContact?.id === contact.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-semibold text-slate-900 truncate pr-2">{contact.name}</h3>
                                    {contact.last_message && (
                                        <span className="text-xs text-slate-400 whitespace-nowrap">
                                            {new Date(contact.last_active || '').toLocaleDateString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </div>
                                <div className="flex justify-between items-end">
                                    <p className="text-sm text-slate-500 truncate w-full pr-2">
                                        {contact.last_message?.content || <span className="italic text-slate-400">Нет сообщений</span>}
                                    </p>
                                    {contact.telegram_user_id && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">TG</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="w-2/3 flex flex-col h-full">
                {selectedContact ? (
                    <>
                        {/* Header */}
                        <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{selectedContact.name}</h2>
                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                    {selectedContact.phone && <span>{selectedContact.phone}</span>}
                                    {selectedContact.telegram_user_id && (
                                        <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs">Telegram: {selectedContact.telegram_user_id}</span>
                                    )}
                                </div>
                            </div>
                            <Link
                                to={`/contacts/${selectedContact.id}`}
                                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                            >
                                Открыть профиль →
                            </Link>
                        </div>

                        {/* Messages List */}
                        <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
                            {isLoadingMessages ? (
                                <div className="text-center text-slate-500 mt-10">Загрузка сообщений...</div>
                            ) : messages.length === 0 ? (
                                <div className="text-center text-slate-400 mt-10">История сообщений пуста</div>
                            ) : (
                                messages.map((msg) => {
                                    const isOwn = msg.author_type === 'manager' || msg.author_type === 'Админ' || msg.author_type === 'Менеджер';
                                    return (
                                        <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                            <div
                                                className={`max-w-[70%] p-3 rounded-2xl shadow-sm text-sm ${isOwn
                                                    ? 'bg-blue-600 text-white rounded-br-none'
                                                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                                                    }`}
                                            >
                                                {msg.file_url && (
                                                    <div className="mb-2">
                                                        {(msg.message_type === 'image' || (msg.message_type as any) === 'photo') ? (
                                                            <img src={msg.file_url} alt="Attachment" className="max-w-full rounded" />
                                                        ) : (
                                                            <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="underline text-inherit flex items-center gap-1">
                                                                📎 Вложение
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="whitespace-pre-wrap">{msg.content}</div>
                                                <div className={`text-[10px] mt-1 text-right ${isOwn ? 'text-blue-200' : 'text-slate-400'}`}>
                                                    {new Date(msg['Created Date'] || msg.created_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-200">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Напишите сообщение..."
                                    className="flex-1 p-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    disabled={!messageInput.trim()}
                                    className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                                >
                                    Отправить
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                        <span className="text-4xl mb-4">💬</span>
                        <p className="text-lg">Выберите диалог, чтобы начать общение</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InboxPage;
