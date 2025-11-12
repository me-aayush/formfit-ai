// src/components/VirtualTrainer.js (Updated with Real AI)

import React, { useState, useRef, useEffect } from 'react';
import { getAIResponse, checkAPIStatus, getUsageStats, updateUsageStats } from '../Services/aiServices.js';

const VirtualTrainer = ({ currentExercise, formScore, repCount, recentFeedback }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hi! I\'m your AI fitness coach. Ask me anything about form, exercises, or workout plans!',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState({ openai: false, claude: false });
  const [usageStats, setUsageStats] = useState({ totalCost: 0, messageCount: 0 });
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    // Check if API keys are configured
    const status = checkAPIStatus();
    setApiStatus(status);
    
    // Show warning if no API configured
    if (!status.openai && !status.claude && status.activeProvider !== 'mock') {
      console.warn('No AI API keys configured. Using mock responses. Add API keys to .env file.');
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      // Prepare context for AI
      const context = {
        exercise: currentExercise,
        reps: repCount,
        formScore: formScore,
        recentFeedback: recentFeedback || []
      };

      // Get conversation history (last 6 messages for context)
      const conversationHistory = messages.slice(-6).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call AI service
      const response = await getAIResponse(input, context, conversationHistory);

      if (response.success) {
        // Update usage statistics
        if (response.metadata) {
          updateUsageStats(response.metadata);
          setUsageStats(getUsageStats());
        }

        const assistantMessage = {
          role: 'assistant',
          content: response.message,
          timestamp: new Date(),
          metadata: response.metadata
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Fallback response on error
        const errorMessage = {
          role: 'assistant',
          content: response.message,
          timestamp: new Date(),
          isError: true
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error getting AI response:', error);
      const errorMessage = {
        role: 'assistant',
        content: "Sorry, I'm having trouble right now. Please try again in a moment.",
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = [
    "How's my form?",
    "Give me workout tips",
    "Create a workout plan",
    `Tips for ${currentExercise}`,
  ];

  const handleQuickPrompt = (prompt) => {
    setInput(prompt);
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={styles.floatingButton}
          title="Chat with AI Trainer"
        >
          <span style={styles.buttonIcon}>🤖</span>
          <span style={styles.buttonText}>AI Trainer</span>
          {repCount > 0 && (
            <span style={styles.notificationBadge}>{repCount}</span>
          )}
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div style={styles.chatContainer}>
          {/* Header */}
          <div style={styles.chatHeader}>
            <div style={styles.headerLeft}>
              <div style={styles.trainerAvatar}>🤖</div>
              <div style={styles.headerInfo}>
                <div style={styles.trainerName}>AI Fitness Coach</div>
                <div style={styles.trainerStatus}>
                  <span style={styles.statusDot}></span>
                  {apiStatus.activeProvider === 'mock' ? 'Demo Mode' : 'AI Powered'}
                </div>
              </div>
            </div>
            <div style={styles.headerRight}>
              {/* Show cost if using real API */}
              {apiStatus.activeProvider !== 'mock' && usageStats.messageCount > 0 && (
                <div style={styles.costBadge} title="Session cost">
                  ${usageStats.totalCost.toFixed(4)}
                </div>
              )}
              <button
                onClick={() => setIsOpen(false)}
                style={styles.closeButton}
                title="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* API Status Warning */}
          {apiStatus.activeProvider === 'mock' && messages.length <= 2 && (
            <div style={styles.warningBanner}>
              ℹ️ Demo mode - Add API keys for real AI. See console for setup.
            </div>
          )}

          {/* Current Workout Context */}
          {repCount > 0 && (
            <div style={styles.contextBar}>
              <span style={styles.contextIcon}>💪</span>
              <span style={styles.contextText}>
                {currentExercise.charAt(0).toUpperCase() + currentExercise.slice(1)}: {repCount} reps • Form: {formScore}%
              </span>
            </div>
          )}

          {/* Messages */}
          <div style={styles.messagesContainer} ref={chatContainerRef}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.messageWrapper,
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                {msg.role === 'assistant' && (
                  <div style={styles.avatarSmall}>🤖</div>
                )}
                <div
                  style={{
                    ...styles.message,
                    ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
                    ...(msg.isError ? styles.errorMessage : {})
                  }}
                >
                  <div style={styles.messageContent}>
                    {msg.content.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {line}
                        {i < msg.content.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={styles.messageTime}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {msg.metadata?.estimatedCost > 0 && (
                      <span style={styles.costLabel}> • ${msg.metadata.estimatedCost.toFixed(4)}</span>
                    )}
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div style={{...styles.avatarSmall, background: '#667eea'}}>👤</div>
                )}
              </div>
            ))}

            {isTyping && (
              <div style={styles.messageWrapper}>
                <div style={styles.avatarSmall}>🤖</div>
                <div style={{...styles.message, ...styles.assistantMessage}}>
                  <div style={styles.typingIndicator}>
                    <span style={styles.typingDot}></span>
                    <span style={{...styles.typingDot, animationDelay: '0.2s'}}></span>
                    <span style={{...styles.typingDot, animationDelay: '0.4s'}}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          {messages.length <= 2 && (
            <div style={styles.quickPromptsContainer}>
              <div style={styles.quickPromptsLabel}>Quick questions:</div>
              <div style={styles.quickPrompts}>
                {quickPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickPrompt(prompt)}
                    style={styles.quickPromptButton}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div style={styles.inputContainer}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about form, workouts, or fitness tips..."
              style={styles.input}
              rows={1}
              disabled={isTyping}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              style={{
                ...styles.sendButton,
                opacity: (input.trim() && !isTyping) ? 1 : 0.5,
                cursor: (input.trim() && !isTyping) ? 'pointer' : 'not-allowed'
              }}
            >
              <span style={styles.sendIcon}>➤</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

const styles = {
  floatingButton: {
    position: 'fixed',
    bottom: '30px',
    right: '30px',
    width: '180px',
    height: '60px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '30px',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.3s',
    zIndex: 999,
  },
  buttonIcon: {
    fontSize: '1.5rem',
  },
  buttonText: {
    fontSize: '1rem',
  },
  notificationBadge: {
    position: 'absolute',
    top: '-5px',
    right: '-5px',
    background: '#e53e3e',
    color: '#fff',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    border: '2px solid #0a0e27',
  },
  chatContainer: {
    position: 'fixed',
    bottom: '30px',
    right: '30px',
    width: '400px',
    height: '600px',
    background: '#1a1f3a',
    borderRadius: '16px',
    boxShadow: '0 12px 48px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    border: '1px solid #2a2f4a',
    overflow: 'hidden',
  },
  chatHeader: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #2a2f4a',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  trainerAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
  },
  headerInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  trainerName: {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: '#fff',
  },
  trainerStatus: {
    fontSize: '0.75rem',
    color: 'rgba(255, 255, 255, 0.9)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#48bb78',
    animation: 'pulse 2s infinite',
  },
  costBadge: {
    background: 'rgba(255, 255, 255, 0.2)',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    color: '#fff',
    fontWeight: 'bold',
  },
  closeButton: {
    background: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#fff',
    fontSize: '1.2rem',
    transition: 'all 0.2s',
  },
  warningBanner: {
    background: 'rgba(237, 137, 54, 0.2)',
    padding: '8px 16px',
    fontSize: '0.8rem',
    color: '#ed8936',
    borderBottom: '1px solid #2a2f4a',
    textAlign: 'center',
  },
  contextBar: {
    background: 'rgba(102, 126, 234, 0.15)',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '1px solid #2a2f4a',
  },
  contextIcon: {
    fontSize: '1rem',
  },
  contextText: {
    fontSize: '0.85rem',
    color: '#cbd5e0',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  messageWrapper: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
  },
  avatarSmall: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: '#667eea',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    flexShrink: 0,
  },
  message: {
    maxWidth: '75%',
    padding: '12px 14px',
    borderRadius: '12px',
    fontSize: '0.9rem',
    lineHeight: '1.5',
    wordWrap: 'break-word',
  },
  userMessage: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    borderBottomRightRadius: '4px',
  },
  assistantMessage: {
    background: '#2a2f4a',
    color: '#fff',
    borderBottomLeftRadius: '4px',
  },
  errorMessage: {
    background: 'rgba(245, 101, 101, 0.2)',
    borderLeft: '3px solid #f56565',
  },
  messageContent: {
    marginBottom: '4px',
  },
  messageTime: {
    fontSize: '0.7rem',
    opacity: 0.6,
    textAlign: 'right',
  },
  costLabel: {
    fontSize: '0.65rem',
    opacity: 0.5,
  },
  typingIndicator: {
    display: 'flex',
    gap: '4px',
    padding: '4px 0',
  },
  typingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#667eea',
    animation: 'bounce 1.4s infinite ease-in-out',
  },
  quickPromptsContainer: {
    padding: '12px 16px',
    borderTop: '1px solid #2a2f4a',
    background: '#0a0e27',
  },
  quickPromptsLabel: {
    fontSize: '0.75rem',
    color: '#cbd5e0',
    marginBottom: '8px',
  },
  quickPrompts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  quickPromptButton: {
    background: '#2a2f4a',
    border: '1px solid #667eea',
    borderRadius: '16px',
    padding: '6px 12px',
    fontSize: '0.8rem',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  inputContainer: {
    display: 'flex',
    gap: '8px',
    padding: '16px',
    background: '#0a0e27',
    borderTop: '1px solid #2a2f4a',
  },
  input: {
    flex: 1,
    background: '#2a2f4a',
    border: '1px solid #667eea',
    borderRadius: '20px',
    padding: '12px 16px',
    color: '#fff',
    fontSize: '0.9rem',
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit',
    maxHeight: '100px',
  },
  sendButton: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '50%',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    flexShrink: 0,
  },
  sendIcon: {
    fontSize: '1.2rem',
    color: '#fff',
  },
};

// Add keyframe animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  @keyframes bounce {
    0%, 80%, 100% { transform: translateY(0); }
    40% { transform: translateY(-8px); }
  }
`;
document.head.appendChild(styleSheet);

export default VirtualTrainer;