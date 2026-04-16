import React, { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { createChatMessage } from '../../shared/chat';
import { useAppContext } from '../context/AppContext';
import { chatWithStylist } from '../services/stylist-service';
import { type ThemeTokens } from '../theme';

const SUGGESTIONS = [
  'What should I wear today?',
  'Build a polished casual look',
  'What piece would sharpen this wardrobe?',
];

export function ChatScreen() {
  const { state, dispatch, theme } = useAppContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  const handleSend = async (presetText?: string) => {
    const message = String(presetText ?? text).trim();
    if (!message || state.chatLoading) return;

    const userMessage = createChatMessage('user', message);
    const draftState = {
      ...state,
      chatMessages: [...state.chatMessages, userMessage],
    };

    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: userMessage });
    dispatch({ type: 'SET_CHAT_LOADING', payload: true });
    dispatch({ type: 'SET_CHAT_ERROR', payload: null });
    setText('');

    try {
      const reply = await chatWithStylist(draftState, message);
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: createChatMessage('model', reply) });
      dispatch({ type: 'SET_CHAT_LOADING', payload: false });
    } catch {
      dispatch({ type: 'SET_CHAT_LOADING', payload: false });
      dispatch({ type: 'SET_CHAT_ERROR', payload: 'The stylist is quiet for a moment. Try again.' });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={12}
      style={styles.container}
    >
      <View style={styles.headerRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.text} />
        <Text style={styles.headerTitle}>AI Stylist</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {state.chatMessages.length === 0 ? (
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeTitle}>Ask for outfit guidance</Text>
            <Text style={styles.welcomeText}>
              Ask for outfit ideas, missing pieces, or ways to sharpen the look already on your mannequin.
            </Text>
            <View style={styles.suggestionWrap}>
              {SUGGESTIONS.map(suggestion => (
                <Pressable key={suggestion} onPress={() => void handleSend(suggestion)} style={styles.suggestionChip}>
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          state.chatMessages.map(message => {
            const isUser = message.role === 'user';
            return (
              <View key={message.id} style={[styles.messageRow, isUser ? styles.userRow : styles.modelRow]}>
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.modelBubble]}>
                  <Text style={[styles.messageText, isUser && styles.userText]}>{message.text}</Text>
                </View>
              </View>
            );
          })
        )}

        {state.chatLoading ? (
          <View style={styles.modelRow}>
            <View style={[styles.bubble, styles.modelBubble]}>
              <Text style={styles.loadingText}>Thinking through the look...</Text>
            </View>
          </View>
        ) : null}

        {state.chatError ? <Text style={styles.errorText}>{state.chatError}</Text> : null}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask your stylist"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          multiline
        />
        <Pressable
          onPress={() => void handleSend()}
          disabled={!text.trim() || state.chatLoading}
          style={[styles.sendButton, (!text.trim() || state.chatLoading) && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: '800',
    },
    messages: {
      gap: 14,
      paddingBottom: theme.spacing.md,
    },
    welcomeCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    welcomeTitle: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '800',
    },
    welcomeText: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
    suggestionWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
    },
    suggestionChip: {
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    suggestionText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    messageRow: {
      flexDirection: 'row',
    },
    userRow: {
      justifyContent: 'flex-end',
    },
    modelRow: {
      justifyContent: 'flex-start',
    },
    bubble: {
      maxWidth: '86%',
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    userBubble: {
      backgroundColor: theme.colors.accent,
      borderBottomRightRadius: 8,
    },
    modelBubble: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderBottomLeftRadius: 8,
    },
    messageText: {
      color: theme.colors.text,
      fontSize: 15,
      lineHeight: 21,
    },
    userText: {
      color: theme.colors.accentContrast,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 13,
      lineHeight: 18,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.spacing.sm,
    },
    input: {
      flex: 1,
      minHeight: 56,
      maxHeight: 132,
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: theme.colors.text,
      fontSize: 15,
      textAlignVertical: 'top',
    },
    sendButton: {
      minWidth: 84,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    sendButtonDisabled: {
      opacity: 0.45,
    },
    sendButtonText: {
      color: theme.colors.accentContrast,
      fontSize: 14,
      fontWeight: '800',
    },
  });
}
