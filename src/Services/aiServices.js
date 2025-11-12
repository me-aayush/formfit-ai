// src/services/aiService.js

/**
 * AI Service for FormFit AI - Supports OpenAI and Claude APIs
 * Provides intelligent fitness coaching with context awareness
 */

const AI_PROVIDERS = {
  OPENAI: 'openai',
  CLAUDE: 'claude',
  MOCK: 'mock' // Fallback for testing without API keys
};

// Configure which provider to use
const ACTIVE_PROVIDER = process.env.REACT_APP_AI_PROVIDER || AI_PROVIDERS.MOCK;

// System prompt - defines AI personality and behavior
const SYSTEM_PROMPT = `You are an expert AI fitness coach and personal trainer with certifications in:
- Exercise physiology
- Biomechanics and form analysis
- Sports nutrition
- Injury prevention

Your role:
1. Analyze exercise form based on real-time data
2. Provide specific, actionable advice
3. Be encouraging but honest about form issues
4. Prioritize safety and injury prevention
5. Keep responses concise (2-4 sentences for quick questions, more for complex ones)
6. Use emojis occasionally for engagement

Important: If asked about pain or injuries, always recommend consulting healthcare professionals.`;

/**
 * OpenAI GPT Integration
 */
const callOpenAI = async (userMessage, context, conversationHistory) => {
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not found. Add REACT_APP_OPENAI_API_KEY to your .env file');
  }

  // Build context-aware system message
  const contextMessage = `Current workout context:
- Exercise: ${context.exercise}
- Reps completed: ${context.reps}
- Form quality score: ${context.formScore}/100
- Recent feedback: ${context.recentFeedback.slice(0, 3).map(f => f.message).join(', ')}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.REACT_APP_OPENAI_MODEL || "gpt-3.5-turbo", // Use gpt-4 for better quality
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: contextMessage },
          ...conversationHistory.slice(-6), // Last 6 messages for context
          { role: "user", content: userMessage }
        ],
        max_tokens: 300,
        temperature: 0.7,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      tokensUsed: data.usage.total_tokens,
      cost: calculateOpenAICost(data.usage)
    };
  } catch (error) {
    console.error('OpenAI API Error:', error);
    throw error;
  }
};

/**
 * Claude API Integration
 */
const callClaude = async (userMessage, context, conversationHistory) => {
  const apiKey = process.env.REACT_APP_CLAUDE_API_KEY;
  
  if (!apiKey) {
    throw new Error('Claude API key not found. Add REACT_APP_CLAUDE_API_KEY to your .env file');
  }

  const contextMessage = `Current workout: ${context.exercise}, ${context.reps} reps, ${context.formScore}% form quality`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.REACT_APP_CLAUDE_MODEL || "claude-3-sonnet-20240229",
        max_tokens: 300,
        system: `${SYSTEM_PROMPT}\n\n${contextMessage}`,
        messages: [
          ...conversationHistory.slice(-6),
          { role: "user", content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Claude API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
      cost: calculateClaudeCost(data.usage)
    };
  } catch (error) {
    console.error('Claude API Error:', error);
    throw error;
  }
};

/**
 * Mock AI for testing without API keys
 */
const callMockAI = async (userMessage, context) => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const responses = [
    `Based on your ${context.exercise} with ${context.formScore}% form, here's my advice: Focus on controlled movements and maintaining proper alignment throughout the exercise.`,
    `Great job on ${context.reps} reps! For ${context.exercise}, remember to engage your core and maintain steady breathing.`,
    `I see you're working on ${context.exercise}. Keep your form score above 80% for optimal results and injury prevention.`
  ];
  
  return {
    content: responses[Math.floor(Math.random() * responses.length)],
    tokensUsed: 0,
    cost: 0
  };
};

/**
 * Cost calculation helpers
 */
const calculateOpenAICost = (usage) => {
  const model = process.env.REACT_APP_OPENAI_MODEL || "gpt-3.5-turbo";
  
  const pricing = {
    "gpt-4": { input: 0.03, output: 0.06 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 }
  };
  
  const prices = pricing[model] || pricing["gpt-3.5-turbo"];
  const inputCost = (usage.prompt_tokens / 1000) * prices.input;
  const outputCost = (usage.completion_tokens / 1000) * prices.output;
  
  return inputCost + outputCost;
};

const calculateClaudeCost = (usage) => {
  // Claude Sonnet pricing (as of 2024)
  const inputPrice = 0.003; // per 1K tokens
  const outputPrice = 0.015; // per 1K tokens
  
  const inputCost = (usage.input_tokens / 1000) * inputPrice;
  const outputCost = (usage.output_tokens / 1000) * outputPrice;
  
  return inputCost + outputCost;
};

/**
 * Main AI service function
 * @param {string} userMessage - User's question
 * @param {object} context - Workout context (exercise, reps, formScore, feedback)
 * @param {array} conversationHistory - Previous messages
 * @returns {Promise<object>} AI response with metadata
 */
export const getAIResponse = async (userMessage, context, conversationHistory = []) => {
  try {
    let result;
    
    switch (ACTIVE_PROVIDER) {
      case AI_PROVIDERS.OPENAI:
        result = await callOpenAI(userMessage, context, conversationHistory);
        break;
      
      case AI_PROVIDERS.CLAUDE:
        result = await callClaude(userMessage, context, conversationHistory);
        break;
      
      case AI_PROVIDERS.MOCK:
      default:
        result = await callMockAI(userMessage, context);
        break;
    }
    
    return {
      success: true,
      message: result.content,
      metadata: {
        provider: ACTIVE_PROVIDER,
        tokensUsed: result.tokensUsed,
        estimatedCost: result.cost,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('AI Service Error:', error);
    return {
      success: false,
      message: "I'm having trouble connecting right now. Here's general advice: Focus on proper form, controlled movements, and listening to your body. If you have specific concerns, please consult a fitness professional.",
      error: error.message
    };
  }
};

/**
 * Check if API keys are configured
 */
export const checkAPIStatus = () => {
  return {
    openai: !!process.env.REACT_APP_OPENAI_API_KEY,
    claude: !!process.env.REACT_APP_CLAUDE_API_KEY,
    activeProvider: ACTIVE_PROVIDER
  };
};

/**
 * Get usage statistics (for tracking costs)
 */
let sessionStats = {
  totalTokens: 0,
  totalCost: 0,
  messageCount: 0
};

export const getUsageStats = () => sessionStats;

export const updateUsageStats = (metadata) => {
  sessionStats.totalTokens += metadata.tokensUsed || 0;
  sessionStats.totalCost += metadata.estimatedCost || 0;
  sessionStats.messageCount += 1;
};

export const resetUsageStats = () => {
  sessionStats = { totalTokens: 0, totalCost: 0, messageCount: 0 };
};