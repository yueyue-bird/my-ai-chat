// @ts-nocheck
'use client';

import { useState, useRef } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 使用 ref 来跟踪当前正在生成的消息索引，避免状态闭包问题
  const assistantMessageIndex = useRef<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    // 1. 立即更新用户消息
    setMessages(prev => [...prev, userMessage]);
    
    setInput('');
    setIsLoading(true);
    setError(null);

    // 2. 预先添加一个空的 AI 消息占位
    setMessages(prev => {
      const newIndex = prev.length;
      assistantMessageIndex.current = newIndex; // 记录当前 AI 消息的索引
      return [...prev, { role: 'assistant', content: '' }];
    });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] }), // 发送包含最新用户消息的列表
      });

      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status}`);
      }

      if (!response.body) throw new Error("响应体为空");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; 

        for (const line of lines) {
          const trimmed = line.trim();
          
          if (trimmed.startsWith('data: ')) {
            const jsonPart = trimmed.slice(6);
            
            if (jsonPart === '[DONE]') continue;

            try {
              const data = JSON.parse(jsonPart);
              const content = data.choices?.[0]?.delta?.content;

              if (typeof content === 'string' && content.length > 0) {
                // ✅ 核心修复：使用函数式更新，并直接操作特定索引
                setMessages(prev => {
                  const next = [...prev];
                  const idx = assistantMessageIndex.current;
                  
                  // 安全检查：确保索引有效且是 assistant 消息
                  if (idx !== null && idx < next.length && next[idx].role === 'assistant') {
                    // 直接追加内容，不创建新对象，减少重渲染冲突
                    next[idx] = {
                      ...next[idx],
                      content: next[idx].content + content
                    };
                  }
                  return next;
                });
              }
            } catch (parseError) {
              console.warn('解析跳过:', trimmed);
            }
          }
        }
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || '发生未知错误');
      // 出错时移除最后的空占位
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      assistantMessageIndex.current = null; // 重置索引
    }
  };

  return (
    <div className="flex flex-col w-full max-w-2xl py-12 mx-auto stretch min-h-screen bg-gray-50">
    <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
        DeepSeek AI
      </h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-center">
          ❌ {error}
        </div>
      )}

      <div className="flex-1 space-y-6 mb-48 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-20">
           
          </div>
        ) : (
          messages.map((m, index) => (
            <div key={index} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-4 rounded-2xl shadow-md ${
                m.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'
              }`}>
                <div className="text-xs font-bold mb-1 opacity-60">
                  {m.role === 'user' ? '你' : 'AI'}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed break-words">
                  {m.content}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-2xl mx-auto flex gap-3">
          <input
            className="flex-1 p-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入问题..."
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={isLoading || !input}
            className="px-6 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isLoading ? '...' : '发送'}
          </button>
        </div>
      </form>
    </div>
  );
}