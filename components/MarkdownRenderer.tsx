import React from 'react';

// A lightweight markdown renderer. 
// In a full production app, utilize 'react-markdown' or 'remark'.
// Here we do basic processing for bold, code blocks, and newlines to avoid extra large dependencies.

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const processText = (text: string) => {
    // 1. Code blocks (```code```)
    const codeBlockRegex = /```([\s\S]*?)```/g;
    const parts = text.split(codeBlockRegex);

    return parts.map((part, index) => {
      if (index % 2 === 1) {
        // This is code
        return (
          <pre key={index} className="bg-gray-800 text-gray-100 p-3 rounded-md overflow-x-auto text-sm my-2 font-mono">
            <code>{part.trim()}</code>
          </pre>
        );
      } else {
        // This is normal text, split by newlines
        return part.split('\n').map((line, i) => {
          if (!line) return <div key={`${index}-${i}`} className="h-2" />;
          
          // Basic Bold parsing (**text**)
          const boldParts = line.split(/(\*\*.*?\*\*)/g);
          return (
            <p key={`${index}-${i}`} className="mb-1 leading-relaxed break-words">
              {boldParts.map((bp, j) => {
                if (bp.startsWith('**') && bp.endsWith('**')) {
                  return <strong key={j}>{bp.slice(2, -2)}</strong>;
                }
                return <span key={j}>{bp}</span>;
              })}
            </p>
          );
        });
      }
    });
  };

  return <div className="markdown-body">{processText(content)}</div>;
};

export default MarkdownRenderer;